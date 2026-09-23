import { environment } from '../../../../environments/environment';

export function withApiUrl<T extends { url: string }>(value: T): T {
  return { ...value, url: `${environment.apiUrl}${value.url}` };
}

export function withModelApiUrl<T extends { model?: { url: string } }>(value: T): T {
  if (!value.model) return value;
  return { ...value, model: withApiUrl(value.model) };
}