import { useCallback, useEffect, useRef, useState } from 'react';
import volumeImg from '../../../assets/volume.svg';
import { sound } from '@pixi/sound';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';

export default function MusicButton() {
  const musicUrl = useQuery(api.music.getBackgroundMusic);
  const fallbackMusicUrl = `${import.meta.env.BASE_URL}assets/background.mp3`;
  const playableMusicUrl = musicUrl ?? fallbackMusicUrl;
  const [isPlaying, setPlaying] = useState(false);
  const loadedMusicUrlRef = useRef<string | null>(null);

  const flipSwitch = useCallback(async () => {
    if (loadedMusicUrlRef.current !== playableMusicUrl) {
      if (loadedMusicUrlRef.current) {
        sound.remove('background');
      }
      sound.add('background', playableMusicUrl).loop = true;
      loadedMusicUrlRef.current = playableMusicUrl;
    }

    if (isPlaying) {
      sound.stop('background');
      setPlaying(false);
      return;
    }

    try {
      await sound.play('background');
      setPlaying(true);
    } catch (error) {
      console.warn('Unable to play background music', error);
      setPlaying(false);
    }
  }, [isPlaying, playableMusicUrl]);

  const handleKeyPress = useCallback(
    (event: { key: string }) => {
      if (event.key === 'm' || event.key === 'M') {
        void flipSwitch();
      }
    },
    [flipSwitch],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleKeyPress]);

  useEffect(() => {
    return () => {
      if (loadedMusicUrlRef.current) {
        sound.remove('background');
      }
    };
  }, []);

  return (
    <button
      type="button"
      onClick={() => void flipSwitch()}
      className="button hud-button pointer-events-auto bg-transparent text-white shadow-solid focus:outline-none focus:ring-2 focus:ring-clay-100 disabled:opacity-50"
      title={isPlaying ? 'Mute music (M)' : 'Play music (M)'}
      aria-label={isPlaying ? 'Mute music' : 'Play music'}
      aria-pressed={isPlaying}
    >
      <div className="flex h-full w-full items-center justify-center bg-clay-700">
        <span className="relative flex h-full w-full items-center justify-center">
          <img
            className={
              isPlaying
                ? 'size-5 opacity-100 [image-rendering:pixelated]'
                : 'size-5 opacity-55 [image-rendering:pixelated]'
            }
            src={volumeImg}
            alt=""
            aria-hidden="true"
          />
          {isPlaying ? (
            <span
              aria-hidden="true"
              className="absolute right-0.5 top-0.5 flex h-2.5 items-end gap-0.5"
            >
              <span className="block h-1 w-1 bg-white" />
              <span className="block h-2 w-1 bg-white" />
            </span>
          ) : (
            <span aria-hidden="true" className="absolute h-6 w-1 rotate-45 bg-white shadow-solid" />
          )}
        </span>
      </div>
    </button>
  );
}
