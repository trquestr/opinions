import 'server-only';
import { parseServerEnv } from './env-schema';

/** Серверное окружение, разобранное один раз при загрузке модуля. В клиентский бандл не попадает. */
export const serverEnv = parseServerEnv(process.env);
