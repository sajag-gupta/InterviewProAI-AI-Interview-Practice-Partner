import jsPDF from "jspdf";
import type { InterviewDetail } from "@shared/schema";
import { ROLE_LABELS, formatDate } from "@/lib/format";

/** Plain-text PDF of a report. Wraps long lines and adds pages as needed. */
export function exportReportPdf(interview: Pick<InterviewDetail, "role" | "startedAt">, report: NonNullable<InterviewDetail["report"]>) {
  const doc = new jsPDF();
  const width = doc.internal.pageSize.getWidth() - 40;
  let y = 20;

  const write = (text: string, size = 11, gap = 6) => {
    doc.setFontSize(size);
    for (const line of doc.splitTextToSize(text, width)) {
      if (y > 280) {
        doc.addPage();
        y = 20;
      }
      doc.text(line, 20, y);
      y += gap;
    }
  };

  write("Interview report", 20, 10);
  write(`${ROLE_LABELS[interview.role]} - ${formatDate(interview.startedAt)}`, 11, 8);
  write(`Overall ${report.overallScore.toFixed(1)}/10`, 16, 9);
  write(`Communication ${report.communication.toFixed(1)} | Technical depth ${report.technicalDepth.toFixed(1)} | Problem solving ${report.problemSolving.toFixed(1)} | Confidence ${report.confidence.toFixed(1)}`);
  if (report.speech) write(`Delivery: ${report.speech.avgWords} words per answer, ${report.speech.fillersPer100Words} fillers per 100 words, numbers in ${report.speech.answersWithNumbersPct}% of answers`);
  y += 4;
  write(report.detailedFeedback);
  if (report.nextStep) write(`Next: ${report.nextStep}`);
  y += 4;
  write("What worked", 13, 8);
  report.strengths.forEach((s) => write(`- ${s}`));
  y += 4;
  write("Work on", 13, 8);
  report.improvements.forEach((s) => write(`- ${s}`));

  if (report.questionSummaries.length) {
    y += 4;
    write("Question by question", 13, 8);
    report.questionSummaries.forEach((q, i) => {
      write(`${i + 1}. ${q.question} (${q.score}/10)`);
      write(`Answer: ${q.answer}`);
      if (q.feedback) write(`Feedback: ${q.feedback}`);
      if (q.improvedAnswer) write(`Stronger version: ${q.improvedAnswer}`);
      y += 2;
    });
  }

  doc.save(`interview-report-${interview.startedAt.slice(0, 10)}.pdf`);
}
