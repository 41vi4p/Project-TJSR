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

export function OpeningSequence() {
  const [key, setKey] = useState(0);

  useEffect(() => {
    // The total animation sequence takes about 34s + 6s = 40s.
    // Repeating this loop by updating the key creates the infinite loop requested.
    const interval = setInterval(() => {
      setKey(prev => prev + 1);
    }, 42000); // 42 seconds loop for safety
    return () => clearInterval(interval);
  }, []);

  return (
    <div key={key} className="absolute inset-0 w-full h-full pointer-events-none z-20 flex items-center justify-center">
      <div className="os-phrases w-full h-full" id="os-phrases">
        {phrases.map((phrase, tIdx) => {
          const words = phrase.split(' ');
          return (
            <h2 key={tIdx}>
              {words.map((word, wIdx) => (
                <span key={wIdx} className={`word word${wIdx + 1}`}>
                  {word.split('').map((char, cIdx) => (
                    <span key={cIdx} className="char">
                      <span className="char-inner">{char}</span>
                    </span>
                  ))}
                </span>
              ))}
            </h2>
          );
        })}
      </div>
    </div>
  );
}
