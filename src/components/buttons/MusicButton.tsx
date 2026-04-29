import { useCallback, useEffect, useRef, useState } from 'react';
import volumeImg from '../../../assets/volume.svg';
import { sound } from '@pixi/sound';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';

export default function MusicButton() {
  const musicUrl = useQuery(api.music.getBackgroundMusic);
  const [isPlaying, setPlaying] = useState(false);
  const loadedMusicUrlRef = useRef<string | null>(null);

  const flipSwitch = useCallback(async () => {
    if (!musicUrl) {
      return;
    }
    if (loadedMusicUrlRef.current !== musicUrl) {
      if (loadedMusicUrlRef.current) {
        sound.remove('background');
      }
      sound.add('background', musicUrl).loop = true;
      loadedMusicUrlRef.current = musicUrl;
    }

    if (isPlaying) {
      sound.stop('background');
      setPlaying(false);
      return;
    }

    await sound.play('background');
    setPlaying(true);
  }, [isPlaying, musicUrl]);

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
      className="pointer-events-auto inline-flex size-10 items-center justify-center border-2 border-brown-900 bg-clay-700 text-clay-100 shadow-solid transition hover:bg-clay-500 focus:outline-none focus:ring-2 focus:ring-clay-100 disabled:cursor-not-allowed disabled:opacity-50 active:translate-x-px active:translate-y-px"
      title={isPlaying ? 'Mute music (M)' : 'Play music (M)'}
      aria-label={isPlaying ? 'Mute music' : 'Play music'}
      aria-pressed={isPlaying}
      disabled={!musicUrl}
    >
      <img
        className={
          isPlaying
            ? 'size-5 opacity-100 [image-rendering:pixelated]'
            : 'size-5 opacity-75 [image-rendering:pixelated]'
        }
        src={volumeImg}
        alt=""
        aria-hidden="true"
      />
    </button>
  );
}
