import { useEffect, useRef, useState } from "react";
import { ProgramPipeline, type SourceStreams } from "@/lib/program-pipeline";
import type { StageLayout } from "@/lib/stage-layout";
export function useProgramStream(
  enabled: boolean,
  layout: StageLayout,
  streams: SourceStreams,
  caption: string,
) {
  const pipeline = useRef<ProgramPipeline | null>(null),
    latest = useRef({ layout, streams, caption });
  latest.current = { layout, streams, caption };
  const [stream, setStream] = useState<MediaStream | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const program = new ProgramPipeline(latest.current.layout);
    pipeline.current = program;
    program.update(latest.current.layout, latest.current.streams, latest.current.caption);
    program.draw();
    setStream(program.stream);
    return () => {
      pipeline.current = null;
      program.stop();
      setStream(null);
    };
  }, [enabled]);
  useEffect(() => {
    pipeline.current?.update(layout, streams, caption);
  }, [layout, streams, caption]);
  return stream;
}
