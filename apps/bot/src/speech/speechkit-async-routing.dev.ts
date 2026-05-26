import { devLog } from "../dev-log";
import { resolveVoiceRecognitionMode } from "./telegram-voice-handler";

export function devLogSpeechKitAsyncRoutingChecks(): void {
  const sync = resolveVoiceRecognitionMode({
    durationSec: 10,
    syncMaxDurationSec: 30,
    asyncEnabled: true,
    asyncConfigured: true,
    asyncMaxDurationSec: 600,
  });
  devLog(`speechkit routing sync ${sync === "sync" ? "OK" : "FAIL"}`, { mode: sync });

  const asyncMode = resolveVoiceRecognitionMode({
    durationSec: 45,
    syncMaxDurationSec: 30,
    asyncEnabled: true,
    asyncConfigured: true,
    asyncMaxDurationSec: 600,
  });
  devLog(`speechkit routing async ${asyncMode === "async" ? "OK" : "FAIL"}`, { mode: asyncMode });

  const disabled = resolveVoiceRecognitionMode({
    durationSec: 45,
    syncMaxDurationSec: 30,
    asyncEnabled: false,
    asyncConfigured: false,
    asyncMaxDurationSec: 600,
  });
  devLog(
    `speechkit routing reject async disabled ${disabled === "reject_async_disabled" ? "OK" : "FAIL"}`,
    { mode: disabled },
  );

  const tooLong = resolveVoiceRecognitionMode({
    durationSec: 700,
    syncMaxDurationSec: 30,
    asyncEnabled: true,
    asyncConfigured: true,
    asyncMaxDurationSec: 600,
  });
  devLog(
    `speechkit routing reject async too long ${tooLong === "reject_async_too_long" ? "OK" : "FAIL"}`,
    { mode: tooLong },
  );
}
