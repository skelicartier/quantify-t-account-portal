/**
 * Azure SQL DAL Client
 * 
 * Provides Supabase-like query interface for Azure SQL.
 * Replaces Supabase .from().select().eq() pattern.
 */

import sql from "mssql";

const AZURE_SQL_CONFIG: sql.config = {
  server: process.env.AZURE_SQL_SERVER || "qt-sql-prod-aaryan01.database.windows.net",
  database: process.env.AZURE_SQL_DATABASE || "quantify-terminal",
  user: process.env.AZURE_SQL_USER || "qtadmin",
  password: process.env.AZURE_SQL_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: false,
    enableArithAbort: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let pool: sql.ConnectionPool | null = null;

async function getPool(): Promise<sql.ConnectionPool> {
  if (!pool) {
    pool = await new sql.ConnectionPool(AZURE_SQL_CONFIG).connect();
  }
  return pool;
}

/**
 * Supabase-like query builder for Azure SQL
 */
class AzureQuery<T = unknown> {
  private table: string;
  private selectColumns: string[] = [];
  private whereConditions: { column: string; operator: string; value: unknown }[] = [];
  private orderClause: { column: string; ascending: boolean } | null = null;
  private limitCount: number | null = null;
  private singleResult: boolean = false;

  constructor(table: string) {
    this.table = table;
  }

  select(columns: string): this {
    this.selectColumns = columns.split(",").map((c) => c.trim());
    return this;
  }

  eq(column: string, value: unknown): this {
    this.whereConditions.push({ column, operator: "=", value });
    return this;
  }

  neq(column: string, value: unknown): this {
    this.whereConditions.push({ column, operator: "!=", value });
    return this;
  }

  gt(column: string, value: unknown): this {
    this.whereConditions.push({ column, operator: ">", value });
    return this;
  }

  gte(column: string, value: unknown): this {
    this.whereConditions.push({ column, operator: ">=", value });
    return this;
  }

  lt(column: string, value: unknown): this {
    this.whereConditions.push({ column, operator: "<", value });
    return this;
  }

  lte(column: string, value: unknown): this {
    this.whereConditions.push({ column, operator: "<=", value });
    return this;
  }

  like(column: string, value: string): this {
    this.whereConditions.push({ column, operator: "LIKE", value });
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.whereConditions.push({ column, operator: "IN", value: values });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orderClause = { column, ascending: options?.ascending ?? true };
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  single(): this {
    this.singleResult = true;
    this.limitCount = 1;
    return this;
  }

  async execute(): Promise<{ data: T | null; error: Error | null }> {
    try {
      const pool = await getPool();
      const request = pool.request();

      // Build SELECT
      const columns = this.selectColumns.length > 0 ? this.selectColumns.join(", ") : "*";
      let query = `SELECT ${columns} FROM [${this.table}]`;

      // Build WHERE
      if (this.whereConditions.length > 0) {
        const whereClauses = this.whereConditions.map((cond, i) => {
          const paramName = `p${i}`;
          if (cond.operator === "IN") {
            const values = cond.value as unknown[];
            const placeholders = values.map((_, j) => `@${paramName}${j}`).join(", ");
            values.forEach((v, j) => request.input(`${paramName}${j}`, v));
            return `[${cond.column}] IN (${placeholders})`;
          } else {
            request.input(paramName, cond.value);
            return `[${cond.column}] ${cond.operator} @${paramName}`;
          }
        });
        query += ` WHERE ${whereClauses.join(" AND ")}`;
      }

      // Build ORDER BY
      if (this.orderClause) {
        const direction = this.orderClause.ascending ? "ASC" : "DESC";
        query += ` ORDER BY [${this.orderClause.column}] ${direction}`;
      }

      // Build LIMIT
      if (this.limitCount) {
        query += ` OFFSET 0 ROWS FETCH NEXT ${this.limitCount} ROWS ONLY`;
      }

      const result = await request.query(query);
      const rows = result.recordset as T[];

      if (this.singleResult) {
        return { data: rows[0] || null, error: null };
      }
      return { data: rows as T, error: null };
    } catch (error) {
      console.error("Azure SQL query error:", error);
      return { data: null, error: error as Error };
    }
  }
}

/**
 * Insert operation
 */
async function insert<T = unknown>(
  table: string,
  data: Partial<T>,
): Promise<{ data: T | null; error: Error | null }> {
  try {
    const pool = await getPool();
    const request = pool.request();

    const columns = Object.keys(data);
    const values = Object.values(data);
    const paramNames = values.map((_, i) => `@p${i}`);

    values.forEach((v, i) => request.input(`p${i}`, v));

    const query = `INSERT INTO [${table}] (${columns.map((c) => `[${c}]`).join(", ")}) 
                   OUTPUT INSERTED.* 
                   VALUES (${paramNames.join(", ")})`;

    const result = await request.query(query);
    return { data: result.recordset[0] as T, error: null };
  } catch (error) {
    console.error("Azure SQL insert error:", error);
    return { data: null, error: error as Error };
  }
}

/**
 * Update operation
 */
async function update<T = unknown>(
  table: string,
  data: Partial<T>,
  where: { column: string; value: unknown }[],
): Promise<{ data: T | null; error: Error | null }> {
  try {
    const pool = await getPool();
    const request = pool.request();

    const setClauses = Object.keys(data).map((col, i) => {
      request.input(`set${i}`, data[col as keyof T]);
      return `[${col}] = @set${i}`;
    });

    const whereClauses = where.map((cond, i) => {
      request.input(`where${i}`, cond.value);
      return `[${cond.column}] = @where${i}`;
    });

    const query = `UPDATE [${table}] SET ${setClauses.join(", ")} 
                   OUTPUT INSERTED.* 
                   WHERE ${whereClauses.join(" AND ")}`;

    const result = await request.query(query);
    return { data: result.recordset[0] as T, error: null };
  } catch (error) {
    console.error("Azure SQL update error:", error);
    return { data: null, error: error as Error };
  }
}

/**
 * Delete operation
 */
async function deleteRow(
  table: string,
  where: { column: string; value: unknown }[],
): Promise<{ error: Error | null }> {
  try {
    const pool = await getPool();
    const request = pool.request();

    const whereClauses = where.map((cond, i) => {
      request.input(`p${i}`, cond.value);
      return `[${cond.column}] = @p${i}`;
    });

    const query = `DELETE FROM [${table}] WHERE ${whereClauses.join(" AND ")}`;
    await request.query(query);
    return { error: null };
  } catch (error) {
    console.error("Azure SQL delete error:", error);
    return { error: error as Error };
  }
}

/**
 * Supabase-like client interface
 */
export function azureFrom<T = unknown>(table: string) {
  return new AzureQuery<T>(table);
}

export { insert as azureInsert, update as azureUpdate, deleteRow as azureDelete };
