import React from 'react';
import { ArrowLeft, ExternalLink, Mail } from 'lucide-react';

interface DeveloperPageProps {
  onBack: () => void;
}

export const DeveloperPage: React.FC<DeveloperPageProps> = ({ onBack }) => {
  return (
    <div className="pb-24 pt-4 px-3 sm:px-4 max-w-xl mx-auto">
      {/* Back button */}
      <button
        type="button"
        onClick={onBack}
        style={{
          paddingTop: '16px',
          paddingBottom: '16px',
          backgroundColor: '#fdcdc5',
          borderColor: '#000000',
          color: '#000000',
        }}
        className="inline-flex items-center gap-2 text-xs font-semibold border px-3 rounded-xl shadow-xs transition active:scale-95 cursor-pointer mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        <span style={{ fontSize: '14px' }}>मुख्य पृष्ठ पर वापस (Back to Home)</span>
      </button>

      {/* Developer Card */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6 text-slate-800 relative overflow-hidden">
        {/* Background accent glow */}
        <div className="absolute -top-16 -right-16 w-40 h-40 bg-teal-100/60 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-40 h-40 bg-indigo-100/50 rounded-full blur-2xl pointer-events-none" />

        {/* Profile Photo */}
        <div className="relative flex flex-col items-center text-center">
          <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden shadow-lg border-4 border-white ring-4 ring-teal-600/20 bg-slate-100">
            <img
              src="/myimage.jpg"
              alt="Nivesh Kumar"
              className="w-full h-full object-cover"
              onError={(e) => {
                // Graceful fallback to root relative path if needed
                (e.currentTarget as HTMLImageElement).src = 'myimage.jpg';
              }}
            />
          </div>

          {/* Name & Title */}
          <h1 className="mt-4 text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Hi, I'm Nivesh Kumar
          </h1>
          <div className="mt-1.5">
            <span style={{ fontSize: '13px' }} className="inline-block px-3.5 py-1 rounded-full font-bold bg-teal-50 text-teal-800 border border-teal-200 shadow-2xs">
              Full-Stack Web Developer
            </span>
          </div>
        </div>

        {/* Bio Description */}
        <div className="text-center">
          <p style={{ fontSize: '14px' }} className="text-slate-600 leading-relaxed max-w-md mx-auto">
            I am a Computer Science student at Indian Institute of Information Technology Una HP. I enjoy web development and building new projects. I have built projects like a Music Player and other web applications. I am always excited to learn, build, and improve my skills.
          </p>
        </div>

        {/* Skills Section */}
        <div className="space-y-2.5 pt-2 border-t border-slate-100">
          <h2 style={{ fontSize: '13px' }} className="font-bold text-slate-400 uppercase tracking-wider text-center">
            Skills
          </h2>
          <div className="flex flex-wrap justify-center gap-2">
            {['DSA', 'Html', 'Css', 'Java Script'].map((skill) => (
              <span
                key={skill}
                style={{ fontSize: '13px' }}
                className="px-3.5 py-1.5 bg-slate-50 border border-slate-200 text-slate-800 font-semibold rounded-xl shadow-2xs"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>

        {/* Social Links */}
        <div className="space-y-3 pt-3 border-t border-slate-100">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider text-center">
            Connect With Me
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {/* GitHub */}
            <a
              href="https://github.com/nivesh091"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-900 hover:text-white hover:border-slate-900 text-slate-700 text-xs font-bold transition group shadow-2xs"
            >
              <svg
                className="w-4 h-4 fill-current shrink-0"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                />
              </svg>
              <span style={{ fontSize: '13px' }}>GitHub</span>
            </a>

            {/* LinkedIn */}
            <a
              href="https://www.linkedin.com/in/nivesh-kumar-32b476360/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-[#0A66C2] hover:text-white hover:border-[#0A66C2] text-slate-700 text-xs font-bold transition group shadow-2xs"
            >
              <svg
                className="w-4 h-4 fill-current shrink-0"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 8.76c-.97 0-1.75-.79-1.75-1.76s.78-1.75 1.75-1.75 1.75.78 1.75 1.75-.78 1.76-1.75 1.76m1.4 9.74v-8.37H5.06v8.37h2.8z" />
              </svg>
              <span>LinkedIn</span>
            </a>

            {/* Instagram */}
            <a
              href="https://www.instagram.com/nivesh_091"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-[#E4405F] hover:text-white hover:border-[#E4405F] text-slate-700 text-xs font-bold transition group shadow-2xs"
            >
              <svg
                className="w-4 h-4 fill-current shrink-0"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
              </svg>
              <span>Instagram</span>
            </a>

            {/* Gmail */}
            <a
              href="https://mail.google.com/mail/?view=cm&fs=1&to=niveshkumar1230@gmail.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-[#EA4335] hover:text-white hover:border-[#EA4335] text-slate-700 text-xs font-bold transition group shadow-2xs"
            >
              <Mail className="w-4 h-4 shrink-0" />
              <span>Gmail</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
