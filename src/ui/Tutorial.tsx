import { useEffect, useRef } from 'react';
import { useApp } from '../store/app';
import { useTouchDevice } from './useMedia';

// ---- Illustrations: fingertips (amber dots) and the motion that goes with them ----

const Dot = ({ x, y }: { x: number; y: number }) => <circle cx={x} cy={y} r={9} className="tut-dot" />;
const Arrow = ({ d }: { d: string }) => <path d={d} className="tut-arrow" markerEnd="url(#tut-head)" />;

function Defs() {
  return (
    <defs>
      <marker id="tut-head" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M0 0L10 5L0 10z" className="tut-head" />
      </marker>
    </defs>
  );
}

function OneFinger() {
  return (
    <svg viewBox="0 0 120 90" aria-hidden="true">
      <Defs />
      <Arrow d="M60 38V12" />
      <Arrow d="M60 52V78" />
      <Arrow d="M52 45H24" />
      <Arrow d="M68 45H96" />
      <Dot x={60} y={45} />
    </svg>
  );
}

function TwoFingers() {
  return (
    <svg viewBox="0 0 120 90" aria-hidden="true">
      <Defs />
      <Arrow d="M40 55L20 72" />
      <Arrow d="M80 35L100 18" />
      <path d="M78 70A34 34 0 0 1 42 70" className="tut-arrow" markerEnd="url(#tut-head)" />
      <Dot x={46} y={50} />
      <Dot x={74} y={40} />
    </svg>
  );
}

function ThreeFingers() {
  return (
    <svg viewBox="0 0 120 90" aria-hidden="true">
      <Defs />
      <Arrow d="M60 30V8" />
      <Arrow d="M60 60V82" />
      <Arrow d="M30 45H10" />
      <Arrow d="M90 45H110" />
      <Dot x={42} y={45} />
      <Dot x={60} y={40} />
      <Dot x={78} y={45} />
    </svg>
  );
}

function Mouse({ button }: { button: 'left' | 'right' | 'wheel' }) {
  return (
    <svg viewBox="0 0 120 90" aria-hidden="true">
      <Defs />
      <rect x={42} y={12} width={36} height={60} rx={18} className="tut-mouse" />
      <path d="M60 12V36M42 36H78" className="tut-mouse-line" />
      {button === 'left' && <path d="M60 12V36H42V30A18 18 0 0 1 60 12Z" className="tut-dot" />}
      {button === 'right' && <path d="M60 12V36H78V30A18 18 0 0 0 60 12Z" className="tut-dot" />}
      {button === 'wheel' && <rect x={57} y={18} width={6} height={12} rx={3} className="tut-dot" />}
      {button === 'wheel' ? (
        <>
          <Arrow d="M96 40V16" />
          <Arrow d="M96 50V74" />
        </>
      ) : (
        <>
          <Arrow d="M88 44H110" />
          <Arrow d="M32 44H10" />
        </>
      )}
    </svg>
  );
}

const TOUCH = [
  { art: <OneFinger />, title: 'One finger', text: 'Drag to move around. Double-tap to move the pin.' },
  { art: <TwoFingers />, title: 'Two fingers', text: 'Pinch to move closer or further. Twist to turn the view.' },
  { art: <ThreeFingers />, title: 'Three fingers', text: 'Drag up or down to tilt, left or right to orbit.' },
];

const MOUSE = [
  { art: <Mouse button="left" />, title: 'Left-drag', text: 'Move around. Double-click to move the pin.' },
  { art: <Mouse button="right" />, title: 'Right-drag', text: 'Orbit: left/right turns, up/down tilts. Ctrl or Cmd + drag does the same.' },
  { art: <Mouse button="wheel" />, title: 'Scroll', text: 'Move closer or further. Alt + scroll tilts finely. R and T reset north and tilt.' },
];

export function Tutorial() {
  const open = useApp((s) => s.tutorialOpen);
  const touch = useTouchDevice();
  const ref = useRef<HTMLDialogElement>(null);

  // First visit: show it once.
  useEffect(() => {
    if (!useApp.getState().tutorialSeen) useApp.getState().openTutorial();
  }, []);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const steps = touch ? TOUCH : MOUSE;
  return (
    <dialog
      ref={ref}
      className="panel tutorial"
      aria-labelledby="tutorial-title"
      onClose={() => useApp.getState().closeTutorial()}
      onClick={(e) => {
        // A tap on the dimmed backdrop (the dialog itself, outside its content) closes it.
        if (e.target === e.currentTarget) useApp.getState().closeTutorial();
      }}
    >
      <div className="tutorial-inner">
        <button className="icon-button tutorial-close" aria-label="Close tutorial" onClick={() => useApp.getState().closeTutorial()}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <h2 id="tutorial-title" className="title">
          {touch ? 'Moving around with your fingers' : 'Moving around with the mouse'}
        </h2>
        <ol className="tutorial-steps">
          {steps.map((s) => (
            <li key={s.title}>
              <div className="tutorial-art">{s.art}</div>
              <div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="muted tutorial-foot">
          Drag across the sun chart at the bottom to change the time. Open this again any time with the ? button.
        </p>
        <button className="primary tutorial-ok" onClick={() => useApp.getState().closeTutorial()}>
          Got it
        </button>
      </div>
    </dialog>
  );
}
