"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";

const EMOJI_POOL = [
  "🐶",
  "🐱",
  "🐸",
  "🦊",
  "🐼",
  "🐵",
  "🐷",
  "🐮",
  "🐔",
  "🦄",
  "🐙",
  "🐢",
  "🍎",
  "🍕",
  "🍩",
  "🌮",
  "⚽",
  "🎸",
  "🚀",
  "🌈",
  "⭐",
  "🎯",
  "🎲",
  "🧩",
  "🎨",
  "🌻",
  "🍉",
  "🦋",
  "🐝",
  "🍄",
];

const SEQUENCE_LENGTH = 4;
const GRID_SIZE = 6;
const REVEAL_INTERVAL_MS = 1000;
const HIDE_INTERVAL_MS = 500;
const PAUSE_BEFORE_HIDE_MS = 1500;
const FAIL_DISPLAY_MS = 1500;
const SUCCESS_DISPLAY_MS = 1000;

type GamePhase =
  | "idle"
  | "revealing"
  | "hiding"
  | "recalling"
  | "success"
  | "fail";

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function pickRound(): { sequence: string[]; grid: string[] } {
  const pool = shuffleArray(EMOJI_POOL);
  const sequence = pool.slice(0, SEQUENCE_LENGTH);
  const distractors = pool.slice(SEQUENCE_LENGTH, GRID_SIZE);
  const grid = shuffleArray([...sequence, ...distractors]);
  return { sequence, grid };
}

interface EmojiMatchGameProps {
  isActive: boolean;
}

export function EmojiMatchGame({ isActive }: EmojiMatchGameProps) {
  const [gamePhase, setGamePhase] = useState<GamePhase>("idle");
  const [sequence, setSequence] = useState<string[]>([]);
  const [gridEmojis, setGridEmojis] = useState<string[]>([]);
  const [revealIndex, setRevealIndex] = useState(0);
  const [hideIndex, setHideIndex] = useState(0);
  const [userSelections, setUserSelections] = useState<string[]>([]);
  const [round, setRound] = useState(1);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [wrongIndex, setWrongIndex] = useState<number | null>(null);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearTimers = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const startNewRound = useCallback(() => {
    clearTimers();
    const { sequence: newSeq, grid } = pickRound();
    setSequence(newSeq);
    setGridEmojis(grid);
    setRevealIndex(0);
    setHideIndex(0);
    setUserSelections([]);
    setWrongIndex(null);
    setGamePhase("revealing");
  }, [clearTimers]);

  const handleStartGame = () => {
    setRound(1);
    setScore(0);
    setStreak(0);
    startNewRound();
  };

  useEffect(() => {
    return clearTimers;
  }, [clearTimers]);

  useEffect(() => {
    if (!isActive) {
      clearTimers();
    }
  }, [isActive, clearTimers]);

  // Reveal phase animation
  useEffect(() => {
    if (!isActive || gamePhase !== "revealing") return;

    if (revealIndex >= SEQUENCE_LENGTH) {
      timeoutRef.current = setTimeout(() => {
        setGamePhase("hiding");
      }, PAUSE_BEFORE_HIDE_MS);
      return;
    }

    intervalRef.current = setTimeout(() => {
      setRevealIndex((prev) => prev + 1);
    }, REVEAL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearTimeout(intervalRef.current);
    };
  }, [isActive, gamePhase, revealIndex]);

  // Hide phase animation
  useEffect(() => {
    if (!isActive || gamePhase !== "hiding") return;

    if (hideIndex >= SEQUENCE_LENGTH) {
      queueMicrotask(() => setGamePhase("recalling"));
      return;
    }

    intervalRef.current = setTimeout(() => {
      setHideIndex((prev) => prev + 1);
    }, HIDE_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearTimeout(intervalRef.current);
    };
  }, [isActive, gamePhase, hideIndex]);

  // Success / fail phase transitions
  useEffect(() => {
    if (!isActive) return;

    if (gamePhase === "success") {
      timeoutRef.current = setTimeout(() => {
        setRound((r) => r + 1);
        setScore((s) => s + SEQUENCE_LENGTH + streak);
        setStreak((s) => s + 1);
        startNewRound();
      }, SUCCESS_DISPLAY_MS);
      return () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      };
    }

    if (gamePhase === "fail") {
      timeoutRef.current = setTimeout(() => {
        setRound((r) => r + 1);
        setScore((s) => s + userSelections.length);
        setStreak(0);
        startNewRound();
      }, FAIL_DISPLAY_MS);
      return () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      };
    }
  }, [isActive, gamePhase, startNewRound, streak, userSelections.length]);

  const handleGridTap = (emoji: string) => {
    if (gamePhase !== "recalling") return;

    const expectedIndex = userSelections.length;
    const expected = sequence[expectedIndex];

    if (emoji === expected) {
      const newSelections = [...userSelections, emoji];
      setUserSelections(newSelections);

      if (newSelections.length === SEQUENCE_LENGTH) {
        setGamePhase("success");
      }
    } else {
      setWrongIndex(expectedIndex);
      setGamePhase("fail");
    }
  };

  const getSlotContent = (
    index: number,
  ): { emoji: string; state: "hidden" | "revealed" | "filled" | "wrong" } => {
    if (gamePhase === "fail") {
      if (index < userSelections.length) {
        return { emoji: userSelections[index], state: "filled" };
      }
      if (index === wrongIndex) {
        return { emoji: sequence[index], state: "wrong" };
      }
      return { emoji: sequence[index], state: "revealed" };
    }

    if (gamePhase === "success") {
      return { emoji: userSelections[index], state: "filled" };
    }

    if (gamePhase === "recalling") {
      if (index < userSelections.length) {
        return { emoji: userSelections[index], state: "filled" };
      }
      return { emoji: "?", state: "hidden" };
    }

    if (gamePhase === "hiding") {
      if (index < hideIndex) {
        return { emoji: "?", state: "hidden" };
      }
      return { emoji: sequence[index], state: "revealed" };
    }

    // revealing
    if (index < revealIndex) {
      return { emoji: sequence[index], state: "revealed" };
    }
    return { emoji: "?", state: "hidden" };
  };

  const isGridDisabled = gamePhase !== "recalling";

  // Splash screen before game starts
  if (gamePhase === "idle") {
    return (
      <div className="w-full max-w-sm mx-auto flex flex-col items-center gap-3 py-2">
        <h3 className="text-base font-semibold">Memory Sequence</h3>
        <p className="text-xs text-muted-foreground text-center">
          Remember and select in the correct order to score points
        </p>
        <Button onClick={handleStartGame} variant="outline" size="sm">
          Start Game 🚀
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm mx-auto space-y-3">
      {/* Scoreboard - fixed 3-column layout so items don't shift */}
      <div className="grid grid-cols-3 gap-2 px-2 py-1.5 bg-muted/50 rounded-lg text-xs font-medium text-center">
        <span>Round {round}</span>
        <span>Score: {score}</span>
        <span>Streak: {streak}</span>
      </div>

      {/* Sequence slots */}
      <div className="flex justify-center gap-2">
        {Array.from({ length: SEQUENCE_LENGTH }).map((_, i) => {
          const slot = getSlotContent(i);
          return (
            <div
              key={i}
              className={`w-12 h-12 rounded-lg flex items-center justify-center text-2xl
                transition-all duration-200 border-2
                ${slot.state === "hidden" ? "bg-muted border-muted-foreground/20 text-muted-foreground" : ""}
                ${slot.state === "revealed" ? "bg-background border-primary/40 scale-105" : ""}
                ${slot.state === "filled" ? "bg-green-50 border-green-500 dark:bg-green-950/30" : ""}
                ${slot.state === "wrong" ? "bg-red-50 border-red-500 dark:bg-red-950/30 animate-pulse" : ""}
              `}
            >
              {slot.state === "hidden" ? (
                <span className="text-muted-foreground/50 text-base font-medium">
                  ?
                </span>
              ) : (
                <span
                  className={`${slot.state === "revealed" && gamePhase === "revealing" ? "animate-bounce-once" : ""}`}
                >
                  {slot.emoji}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Phase hint */}
      <div className="text-center text-xs text-muted-foreground">
        {gamePhase === "revealing" && (
          <span className="text-yellow-600">Watch carefully...</span>
        )}
        {gamePhase === "hiding" && (
          <span className="text-yellow-600">Remember the order!</span>
        )}
        {gamePhase === "recalling" && (
          <span className="text-blue-600">
            Tap {userSelections.length + 1} of {SEQUENCE_LENGTH}
          </span>
        )}
        {gamePhase === "success" && (
          <span className="text-green-600">Correct!</span>
        )}
        {gamePhase === "fail" && (
          <span className="text-red-600">Oops! Try again</span>
        )}
      </div>

      {/* Emoji selection: 2 rows on mobile, 1 row on sm+ */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 justify-items-center">
        {gridEmojis.map((emoji, i) => {
          const alreadySelected = userSelections.includes(emoji);
          return (
            <button
              key={`${emoji}-${i}`}
              onClick={() => handleGridTap(emoji)}
              disabled={isGridDisabled || alreadySelected}
              className={`w-12 h-12 rounded-lg text-2xl flex items-center justify-center
                transition-all duration-150 border-2
                ${
                  alreadySelected
                    ? "opacity-30 border-muted cursor-not-allowed"
                    : isGridDisabled
                      ? "border-muted-foreground/10 bg-muted/50 cursor-not-allowed"
                      : "border-muted-foreground/20 bg-background hover:border-primary hover:bg-primary/5 active:scale-95 cursor-pointer"
                }
              `}
            >
              {emoji}
            </button>
          );
        })}
      </div>
    </div>
  );
}
