import chokidar from 'chokidar';
import fs from 'fs-extra';
import { globSync } from 'glob';
import path from 'path';
import { ParsedConfig, TSTypedSQLTagTransformConfig } from './config.js';
import {
  SQLTypedQuery,
  TypeDeclarationSet,
  generateDeclarations,
} from './generator.js';
import { TransformJob, WorkerPool } from './index.js';
import { TypeAllocator } from './types.js';
import { debug } from './util.js';
import { getTypeDecsFnResult } from './worker.js';

type TypedSQLTagTransformResult = TypeDeclarationSet | undefined;

// tslint:disable:no-console
export class TypedSqlTagTransformer {
  public readonly workQueue: Promise<TypedSQLTagTransformResult>[] = [];
  private readonly cache: Record<string, TypeDeclarationSet> = {};
  private readonly includePattern: string;
  private readonly localFileName: string;
  private readonly fullFileName: string;

  constructor(
    private readonly pool: WorkerPool,
    private readonly config: ParsedConfig,
    private readonly transform: TSTypedSQLTagTransformConfig,
  ) {
    this.includePattern = `${this.config.srcDir}/**/${transform.include}`;
    this.localFileName = this.transform.emitFileName;
    this.fullFileName = path.relative(process.cwd(), this.localFileName);
  }

  private async watch() {
    let initialized = false;

    const cb = async (fileName: string) => {
      const job = {
        files: [fileName],
      };
      this.pushToQueue(job);
      if (initialized) {
        return this.waitForTypedSQLQueueAndGenerate(true);
      }
    };

    chokidar
      .watch(this.includePattern, {
        persistent: true,
        ignored: [this.localFileName],
      })
      .on('add', cb)
      .on('change', cb)
      .on('unlink', async (file) => await this.removeFileFromCache(file))
      .on('ready', async () => {
        initialized = true;
        await this.waitForTypedSQLQueueAndGenerate(true);
      });
  }

  public async start(watch: boolean) {
    if (watch) {
      return this.watch();
    }

    const fileList = globSync(this.includePattern, {
      ignore: [this.localFileName],
    });

    debug('found query files %o', fileList);

    this.pushToQueue({ files: fileList });
    return this.waitForTypedSQLQueueAndGenerate(false);
  }

  private pushToQueue(job: TransformJob) {
    this.workQueue.push(
      ...job.files.map((fileName) => this.getTsTypeDecs(fileName)),
    );
  }

  private async getTsTypeDecs(
    fileName: string,
  ): Promise<TypedSQLTagTransformResult> {
    console.log(`Processing ${fileName}`);
    return (await this.pool.run(
      {
        fileName,
        transform: this.transform,
      },
      'getTypeDecs',
    )) as Awaited<getTypeDecsFnResult>;
    // Result should be serializable!
  }

  private async waitForTypedSQLQueueAndGenerate(useCache?: boolean) {
    const queueResults = await Promise.all(this.workQueue);
    this.workQueue.length = 0;

    const typeDecsSets: TypeDeclarationSet[] = [];

    for (const result of queueResults) {
      if (result?.typedQueries.length) {
        typeDecsSets.push(result);
        if (useCache) this.cache[result.fileName] = result;
      }
    }

    return this.generateTypedSQLTagFile(
      useCache ? Object.values(this.cache) : typeDecsSets,
    );
  }

  private async removeFileFromCache(fileToRemove: string) {
    delete this.cache[fileToRemove];
    return this.generateTypedSQLTagFile(Object.values(this.cache));
  }

  private async generateTypedSQLTagFile(typeDecsSets: TypeDeclarationSet[]) {
    console.log(`Generating ${this.fullFileName}...`);
    let typeDefinitions = [];
    let queryTypes = [];
    let preparedStatements = [];

    for (const typeDecSet of typeDecsSets) {
      typeDefinitions.push(
        TypeAllocator.typeDefinitionDeclarations(
          this.transform.emitFileName,
          typeDecSet.typeDefinitions,
        ),
      );
      queryTypes.push(generateDeclarations(typeDecSet.typedQueries));

      for (const typeDec of typeDecSet.typedQueries as SQLTypedQuery[]) {
        preparedStatements.push(
          `[\`${typeDec.query.ast.rawStatement}\`]: ` +
            `new PreparedQuery<${typeDec.query.paramTypeAlias},${typeDec.query.returnTypeAlias}>` +
            `(${typeDec.query.name}IR),`,
        );
      }
    }

    queryTypes.push(
      `export const preparedStatements = {\n` +
        preparedStatements.join('\n') +
        `\n} as const;\n\n`,
    );
    queryTypes.push(
      `export const sql = <T extends keyof typeof preparedStatements>(sql: T) => {\n` +
        `  return preparedStatements[sql];\n` +
        `}`,
    );

    let content = '';
    content += typeDefinitions.join('\n');
    content += queryTypes.join('\n');
    content += '\n';
    await fs.outputFile(this.fullFileName, content);
    console.log(`Saved ${this.fullFileName}`);
  }
}
