// THE shared Zod field fragments (dry-audit C1). Message-parameterised factories —
// each schema keeps its exact existing error string, so no user-visible copy changes.
import { z } from 'zod';

export const uuidField = (message: string) => z.string().uuid(message);
export const emailField = (message: string) => z.string().email(message);
