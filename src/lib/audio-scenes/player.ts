import type { Clip } from "./catalog.ts";

export type PlaybackState = "idle" | "loading" | "playing" | "error";
type AudioSource = Pick<HTMLAudioElement, "src" | "play" | "pause" | "load" | "removeAttribute" | "onended" | "onerror">;

export function createPlayer(
  createAudio: () => AudioSource,
  onChange: (id: string, state: PlaybackState) => void,
) {
  let active: { id: string; audio: AudioSource } | null = null;

  function release() {
    if (!active) return;
    const { audio } = active;
    active = null;
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }

  function stop() {
    if (!active) return;
    const { id } = active;
    release();
    onChange(id, "idle");
  }

  async function play({ id, download_path }: Pick<Clip, "id" | "download_path">) {
    stop();
    let audio: AudioSource;
    try {
      audio = createAudio();
    } catch {
      onChange(id, "error");
      return;
    }

    active = { id, audio };
    const fail = () => {
      if (active?.audio !== audio) return;
      release();
      onChange(id, "error");
    };
    audio.onended = () => {
      if (active?.audio === audio) stop();
    };
    audio.onerror = fail;
    onChange(id, "loading");
    try {
      audio.src = download_path;
      await audio.play();
      if (active?.audio === audio) onChange(id, "playing");
    } catch {
      fail();
    }
  }

  return { play, stop, get activeId() { return active?.id ?? null; } };
}
