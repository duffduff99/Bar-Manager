import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MenuRecipe } from '../api';
import { DrinkImage, Modal } from './ui';

const ROW = 64; // px, must match .reel-item height in the stylesheet
const SPIN_MS = 3200;

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** "Pick a drink for me": two quick questions, then a slot-machine reel. */
export function Picker({ recipes, onClose }: { recipes: MenuRecipe[]; onClose: () => void }) {
  const [step, setStep] = useState<'spirit' | 'style' | 'spin'>('spirit');
  const [spirit, setSpirit] = useState<string | null>(null);
  const [style, setStyle] = useState<string | null>(null);
  const [reel, setReel] = useState<MenuRecipe[]>([]);
  const [rolling, setRolling] = useState(false);
  const [landed, setLanded] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const spirits = useMemo(
    () => [...new Set(recipes.map((r) => r.baseSpirit).filter((s): s is string => !!s))].sort(),
    [recipes],
  );
  const bySpirit = useMemo(
    () => (spirit ? recipes.filter((r) => r.baseSpirit === spirit) : recipes),
    [recipes, spirit],
  );
  const styles = useMemo(
    () => [...new Set(bySpirit.flatMap((r) => r.categories))].sort(),
    [bySpirit],
  );
  const pool = useMemo(
    () => (style ? bySpirit.filter((r) => r.categories.includes(style)) : bySpirit),
    [bySpirit, style],
  );

  const spin = (from: MenuRecipe[], avoid?: string) => {
    window.clearTimeout(timer.current);
    const candidates = from.length > 1 && avoid ? from.filter((r) => r.slug !== avoid) : from;
    const winner = candidates[Math.floor(Math.random() * candidates.length)];
    // A long strip of names that ends on the winner.
    const filler: MenuRecipe[] = [];
    while (filler.length < 24) filler.push(...shuffle(from.length > 1 ? from : recipes));
    setReel([...filler.slice(0, 24), winner]);
    setLanded(false);
    setRolling(false);
    setStep('spin');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Two frames so the strip is painted at the top before it starts to move.
    requestAnimationFrame(() => requestAnimationFrame(() => setRolling(true)));
    timer.current = window.setTimeout(() => setLanded(true), reduced ? 50 : SPIN_MS);
  };

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const chooseSpirit = (value: string | null) => {
    setSpirit(value);
    const next = value ? recipes.filter((r) => r.baseSpirit === value) : recipes;
    const nextStyles = new Set(next.flatMap((r) => r.categories));
    if (nextStyles.size > 1 && next.length > 2) setStep('style');
    else spin(next);
  };

  const chooseStyle = (value: string | null) => {
    setStyle(value);
    spin(value ? bySpirit.filter((r) => r.categories.includes(value)) : bySpirit);
  };

  const winner = reel[reel.length - 1];

  return (
    <Modal title="Pick a drink for me" onClose={onClose}>
      {step === 'spirit' && (
        <div className="picker-step">
          <p className="picker-question">What are you in the mood for?</p>
          <div className="picker-options">
            {spirits.map((s) => (
              <button type="button" key={s} className="option" onClick={() => chooseSpirit(s)}>
                {s}
              </button>
            ))}
            <button type="button" className="option option-wild" onClick={() => chooseSpirit(null)}>
              Surprise me
            </button>
          </div>
        </div>
      )}

      {step === 'style' && (
        <div className="picker-step">
          <p className="picker-question">And what kind of drink?</p>
          <div className="picker-options">
            {styles.map((s) => (
              <button type="button" key={s} className="option" onClick={() => chooseStyle(s)}>
                {s}
              </button>
            ))}
            <button type="button" className="option option-wild" onClick={() => chooseStyle(null)}>
              Anything goes
            </button>
          </div>
        </div>
      )}

      {step === 'spin' && winner && (
        <div className="picker-step">
          <div className={landed ? 'reel landed' : 'reel'} aria-hidden={!landed}>
            <div
              className="reel-strip"
              style={{
                transform: `translateY(${rolling ? -(reel.length - 1) * ROW : 0}px)`,
                transitionDuration: rolling ? `${SPIN_MS}ms` : '0ms',
              }}
            >
              {reel.map((r, index) => (
                <div className="reel-item" key={index}>
                  {r.title}
                </div>
              ))}
            </div>
          </div>

          <div className={landed ? 'picker-result show' : 'picker-result'}>
            <div className="picker-result-media">
              <DrinkImage image={winner.image} title={winner.title} glass={winner.glass} />
            </div>
            <p>{winner.description}</p>
            <div className="picker-actions">
              <Link to={`/drink/${winner.slug}`} className="btn btn-primary" onClick={onClose}>
                Show me how
              </Link>
              <button type="button" className="btn" onClick={() => spin(pool, winner.slug)} disabled={!landed}>
                Spin again
              </button>
            </div>
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setSpirit(null);
                setStyle(null);
                setStep('spirit');
              }}
            >
              Start over
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
