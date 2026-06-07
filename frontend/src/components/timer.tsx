import { useEffect, useState } from "react";

type TimerProps = {
  resetKey: string | number;
  initialSeconds: number;
};

function Timer({ resetKey, initialSeconds }: TimerProps) {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    setSecondsLeft(initialSeconds);
    setIsPaused(false);
  }, [initialSeconds, resetKey]);

  useEffect(() => {
    if (isPaused) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setSecondsLeft((prev) => prev - 1);
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isPaused]);

  const absoluteSeconds = Math.abs(secondsLeft);
  const minutes = Math.floor(absoluteSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (absoluteSeconds % 60).toString().padStart(2, "0");
  const timerLabel = `${secondsLeft < 0 ? "-" : ""}${minutes}:${seconds}`;

  return (
    <div className={`timer-block ${secondsLeft < 0 ? "overtime" : ""}`}>
      <p className="timer-value">{timerLabel}</p>
      <div className="timer-actions">
        <button
          type="button"
          className="secondary-button timer-icon-button"
          onClick={() => setIsPaused((prev) => !prev)}
          aria-label={isPaused ? "Continue timer" : "Pause timer"}
          title={isPaused ? "Continue timer" : "Pause timer"}
        >
          {isPaused ? (
            <svg viewBox="0 0 24 24" className="timer-icon" aria-hidden="true">
              <path fill="currentColor" d="M8 5v14l11-7z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="timer-icon" aria-hidden="true">
              <path fill="currentColor" d="M7 5h4v14H7zm6 0h4v14h-4z" />
            </svg>
          )}
        </button>
        <button
          type="button"
          className="secondary-button timer-icon-button"
          onClick={() => {
            setSecondsLeft(initialSeconds);
            setIsPaused(false);
          }}
          aria-label="Reset timer"
          title="Reset timer"
        >
          <svg viewBox="0 0 24 24" className="timer-icon" aria-hidden="true">
            <path
              d="M3 4v6h6M21 20v-6h-6M5.5 15a7.5 7.5 0 0 0 12.8 2.2L21 14.5M18.5 9A7.5 7.5 0 0 0 5.7 6.8L3 9.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default Timer;
