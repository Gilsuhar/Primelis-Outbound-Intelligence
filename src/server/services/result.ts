export type ServiceResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      code: string;
      message: string;
    };

export function ok<T>(data: T): ServiceResult<T> {
  return { ok: true, data };
}

export function err(code: string, message: string): ServiceResult<never> {
  return { ok: false, code, message };
}
