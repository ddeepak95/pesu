"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Quiz } from "@/types/quiz";
import { getContentItemByRefId } from "@/lib/queries/contentItems";
import {
  deleteQuizCompletionForStudent,
  deleteQuizSubmissionForStudent,
  getQuizSubmissionsByQuizWithStudents,
  QuizSubmissionStatus,
} from "@/lib/queries/quizzes";
import { getStudentDisplayName } from "@/lib/utils/displayName";

interface QuizSubmissionsTabProps {
  quiz: Quiz;
}

export default function QuizSubmissionsTab({ quiz }: QuizSubmissionsTabProps) {
  const [submissions, setSubmissions] = useState<QuizSubmissionStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [contentItemId, setContentItemId] = useState<string | null>(null);

  const fetchSubmissions = async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, contentItem] = await Promise.all([
        getQuizSubmissionsByQuizWithStudents(quiz),
        getContentItemByRefId(quiz.id, "quiz"),
      ]);
      setSubmissions(rows);
      setContentItemId(contentItem?.id ?? null);
    } catch (err) {
      console.error("Error fetching quiz submissions:", err);
      setError("Failed to load submissions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubmissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz.id]);

  const getDisplayName = (item: QuizSubmissionStatus) => {
    return getStudentDisplayName(item.student);
  };

  const handleReset = async (item: QuizSubmissionStatus) => {
    if (!item.submission) return;
    const confirmed = window.confirm(
      `Reset submission for ${getDisplayName(item)}? This will delete their submission and allow them to resubmit.`
    );
    if (!confirmed) return;

    setResetting(item.student.student_id);
    try {
      await deleteQuizSubmissionForStudent({
        quizId: quiz.id,
        studentId: item.student.student_id,
      });
      if (contentItemId) {
        await deleteQuizCompletionForStudent({
          contentItemId,
          studentId: item.student.student_id,
        });
      }
      await fetchSubmissions();
    } catch (err) {
      console.error("Error resetting submission:", err);
      alert("Failed to reset submission. Please try again.");
    } finally {
      setResetting(null);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Loading submissions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (submissions.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No students enrolled yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left p-4 font-medium text-sm">Name</th>
            <th className="text-left p-4 font-medium text-sm">Status</th>
            <th className="text-left p-4 font-medium text-sm">Score</th>
            <th className="text-left p-4 font-medium text-sm">Submitted</th>
            <th className="text-right p-4 font-medium text-sm">Actions</th>
          </tr>
        </thead>
        <tbody>
          {submissions.map((item) => {
            const scoreDisplay =
              item.earnedPoints !== undefined && item.totalPoints !== undefined
                ? `${item.earnedPoints}/${item.totalPoints}`
                : "-";
            const submittedAt = item.submittedAt
              ? new Date(item.submittedAt).toLocaleString()
              : "-";
            return (
              <tr
                key={item.student.student_id}
                className="border-b hover:bg-muted/30"
              >
                <td className="p-4">
                  <div className="text-sm font-medium truncate max-w-[200px]">
                    {getDisplayName(item)}
                  </div>
                </td>
                <td className="p-4">
                  <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                    {item.status === "completed" ? "Completed" : "Not started"}
                  </span>
                </td>
                <td className="p-4">
                  <div className="text-sm">{scoreDisplay}</div>
                </td>
                <td className="p-4">
                  <div className="text-sm">{submittedAt}</div>
                </td>
                <td className="p-4">
                  <div className="flex items-center justify-end gap-2">
                    {item.submission && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReset(item)}
                        disabled={resetting === item.student.student_id}
                      >
                        {resetting === item.student.student_id
                          ? "Resetting..."
                          : "Reset"}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
