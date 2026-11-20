import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core/db';
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core/dialect';
import { BetterSQLiteSession } from 'drizzle-orm/better-sqlite3/session';
import {
  createTableRelationsHelpers,
  extractTablesRelationalConfig,
} from 'drizzle-orm/relations';

function normalizeParams(params: unknown[]): SQLInputValue[] {
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p as SQLInputValue;
  });
}

function wrapStatement(db: DatabaseSync, sqlText: string) {
  const objStmt: StatementSync = db.prepare(sqlText);
  let rawStmt: StatementSync | null = null;

  const getRawStmt = (): StatementSync => {
    if (!rawStmt) {
      rawStmt = db.prepare(sqlText);
      const maybeSetReturnArrays = (
        rawStmt as unknown as { setReturnArrays?: (enabled: boolean) => void }
      ).setReturnArrays;
      if (typeof maybeSetReturnArrays === 'function') {
        maybeSetReturnArrays.call(rawStmt, true);
      }
    }
    return rawStmt;
  };

  const toRowArray = (stmt: StatementSync, row: unknown): unknown[] => {
    if (Array.isArray(row)) return row;
    if (row && typeof row === 'object') {
      const cols = stmt.columns();
      const record = row as Record<string, unknown>;
      return cols.map((c) => record[c.name]);
    }
    return [];
  };

  return {
    run(...params: unknown[]) {
      return objStmt.run(...normalizeParams(params));
    },
    all(...params: unknown[]) {
      return objStmt.all(...normalizeParams(params));
    },
    get(...params: unknown[]) {
      return objStmt.get(...normalizeParams(params));
    },
    raw() {
      const stmt = getRawStmt();
      return {
        get(...params: unknown[]) {
          const row = stmt.get(...normalizeParams(params));
          if (row === undefined) return undefined;
          return toRowArray(stmt, row);
        },
        all(...params: unknown[]) {
          const rows = stmt.all(...normalizeParams(params));
          return rows.map((r) => toRowArray(stmt, r));
        },
      };
    },
  };
}

export type NodeSQLiteDatabase<TSchema extends Record<string, unknown>> = BaseSQLiteDatabase<
  'sync',
  unknown,
  TSchema
>;

export function createNodeSqliteDrizzle<TSchema extends Record<string, unknown>>(
  sqlite: DatabaseSync,
  schema: TSchema,
): NodeSQLiteDatabase<TSchema> {
  const clientAdapter = {
    prepare(sqlText: string) {
      return wrapStatement(sqlite, sqlText);
    },
    transaction<T>(fn: (tx: unknown) => T) {
      const runTx = (mode: string) => (tx: unknown) => {
        sqlite.exec(`BEGIN ${mode}`);
        try {
          const result = fn(tx);
          sqlite.exec('COMMIT');
          return result;
        } catch (err) {
          sqlite.exec('ROLLBACK');
          throw err;
        }
      };
      return {
        deferred: runTx('DEFERRED'),
        immediate: runTx('IMMEDIATE'),
        exclusive: runTx('EXCLUSIVE'),
      };
    },
  };

  const dialect = new SQLiteSyncDialect();
  const tablesConfig = extractTablesRelationalConfig(schema, createTableRelationsHelpers);
  const relationalSchema = {
    fullSchema: schema,
    schema: tablesConfig.tables,
    tableNamesMap: tablesConfig.tableNamesMap,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = new BetterSQLiteSession(clientAdapter as any, dialect, relationalSchema, {});
  return new BaseSQLiteDatabase('sync', dialect, session, relationalSchema) as NodeSQLiteDatabase<TSchema>;
}
