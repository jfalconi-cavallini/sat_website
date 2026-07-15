import { MessageCircle } from "lucide-react";

export default function TutorPage() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 bg-slate-950 px-6 text-center text-white">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600">
        <MessageCircle className="h-7 w-7 text-white" />
      </div>
      <div>
        <h1 className="text-4xl font-bold">AI Tutor</h1>
        <p className="mt-2 max-w-md text-slate-400">
          The tutor lives in the chat bubble in the bottom-right corner of every page - open it up and ask
          anything about SAT math, reading, or writing. If you have a question open, it&apos;ll ground its
          answer in that exact question.
        </p>
      </div>
    </div>
  );
}
