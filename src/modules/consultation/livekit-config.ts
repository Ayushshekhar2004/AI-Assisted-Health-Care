import 'server-only';

import {
  parseLiveKitConfig,
  type LiveKitConfig,
} from './livekit-config-validation';

export function getLiveKitConfig(): LiveKitConfig {
  return parseLiveKitConfig(process.env);
}
