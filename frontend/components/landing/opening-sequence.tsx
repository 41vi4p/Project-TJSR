'use client';

import { useEffect, useState } from 'react';

const phrases = [
  "Discover",
  "real",
  "job opportunities,",
  "filtered",
  "and delivered",
  "just for you."
];

const CHAR_STEP = 0.045;  // seconds of stagger between each character
const HOLD_MS   = 2200;   // ms to hold after fully revealed
const FADE_MS   = 650;    // ms for fade-out transition

export function OpeningSequence() {
  const [idx, setIdx]         = useState(0);
  const [fading, setFading]   = useState(false);
  const [animKey, setAnimKey] = useState(0); // forces wrapper remount for fresh char anim

  useEffect(() => {
    const phrase = phrases[idx];
    // estimate when last char finishes animating (includes space chars in index calc)
    const revealMs = phrase.length * CHAR_STEP * 1000 + 650;

    const timer = setTimeout(() => {
      setFading(true);
      setTimeout(() => {
        setFading(false);
        setIdx(prev => (prev + 1) % phrases.length);
        setAnimKey(prev => prev + 1);
      }, FADE_MS);
    }, revealMs + HOLD_MS);

    return () => clearTimeout(timer);
  }, [idx]);

  const phrase = phrases[idx];
  const isAccent = idx === phrases.length - 1;
  const words = phrase.split(' ');
  let globalChar = 0;

  return (
    <div className="absolute inset-0 w-full h-full pointer-events-none z-20 flex items-center justify-center">
      <div
        key={animKey}
        className="os-phrase-wrap"
        style={{ opacity: fading ? 0 : 1 }}
      >
        <h2 className={`os-phrase${isAccent ? ' os-phrase-accent' : ''}`}>
          {words.map((word, wIdx) => {
            const wordStart = globalChar;
            globalChar += word.length + 1;
            return (
              <span key={wIdx} className="word">
                {word.split('').map((char, cIdx) => (
                  <span key={cIdx} className="char">
                    <span
                      className="char-inner"
                      style={{ animationDelay: `${((wordStart + cIdx) * CHAR_STEP).toFixed(3)}s` }}
                    >
                      {char}
                    </span>
                  </span>
                ))}
              </span>
            );
          })}
        </h2>
      </div>
    </div>
  );
}
