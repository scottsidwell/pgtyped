import { PreparedQuery } from '@pgtyped/runtime';

import type { Category } from '../customTypes.js';

export type categoryArray = (Category)[];
/** 'GetBooks' parameters type */
export interface IGetBooksParams {
  id?: number | null | void;
}

/** 'GetBooks' return type */
export interface IGetBooksResult {
  author_id: number | null;
  categories: categoryArray | null;
  id: number;
  name: string | null;
  rank: number | null;
}

/** 'GetBooks' query type */
export interface IGetBooksQuery {
  params: IGetBooksParams;
  result: IGetBooksResult;
}

const getBooksIR: any = {"usedParamSet":{"id":true},"params":[{"name":"id","required":false,"transform":{"type":"scalar"},"locs":[{"a":31,"b":33}]}],"statement":"SELECT * FROM books WHERE id = :id"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM books WHERE id = :id
 * ```
 */
export const getBooks = new PreparedQuery<IGetBooksParams,IGetBooksResult>(getBooksIR);


/** 'SetBooks' parameters type */
export interface ISetBooksParams {
  id?: number | null | void;
  name?: string | null | void;
}

/** 'SetBooks' return type */
export type ISetBooksResult = void;

/** 'SetBooks' query type */
export interface ISetBooksQuery {
  params: ISetBooksParams;
  result: ISetBooksResult;
}

const setBooksIR: any = {"usedParamSet":{"name":true,"id":true},"params":[{"name":"name","required":false,"transform":{"type":"scalar"},"locs":[{"a":24,"b":28}]},{"name":"id","required":false,"transform":{"type":"scalar"},"locs":[{"a":41,"b":43}]}],"statement":"UPDATE books SET name = :name WHERE id = :id"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE books SET name = :name WHERE id = :id
 * ```
 */
export const setBooks = new PreparedQuery<ISetBooksParams,ISetBooksResult>(setBooksIR);



export const preparedStatements = {
[`
    /* @name GetBooks */
    SELECT * FROM books WHERE id = :id;
  `]: new PreparedQuery<IGetBooksParams,IGetBooksResult>(getBooksIR),
[`
    /* @name SetBooks */
    UPDATE books SET name = :name WHERE id = :id;
  `]: new PreparedQuery<ISetBooksParams,ISetBooksResult>(setBooksIR),
} as const;


export const sql = <T extends keyof typeof preparedStatements>(sql: T) => {
  return preparedStatements[sql];
}
