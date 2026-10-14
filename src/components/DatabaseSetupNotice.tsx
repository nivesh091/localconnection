import React, { useState, useEffect } from 'react';
import { Database, Copy, Check, ExternalLink, X, AlertTriangle, RefreshCw } from 'lucide-react';
import { subscribeSchemaPending, checkDatabaseReadiness } from '../lib/supabase';
import { KAAMMITRA_MASTER_SCHEMA_SQL, SUPABASE_SQL_EDITOR_URL, SUPABASE_PROJECT_ID } from '../lib/migrationSql';
import { useTranslation } from '../hooks/useTranslation';

export const DatabaseSetupNotice: React.FC = () => {
  const { lang } = useTranslation();
  const [isPending, setIsPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    // Proactively verify real table readiness against the Supabase project
    checkDatabaseReadiness();

    return subscribeSchemaPending((pending) => {
      setIsPending(pending);
    });
  }, []);

  const handleCheckAgain = async () => {
    setIsChecking(true);
    try {
      await checkDatabaseReadiness();
    } finally {
      setIsChecking(false);
    }
  };

  if (!isPending || dismissed) {
    return null;
  }

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(KAAMMITRA_MASTER_SCHEMA_SQL);
      setCopied(true);
      setTimeout(() => setCopied(false), 4000);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = KAAMMITRA_MASTER_SCHEMA_SQL;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 4000);
    }
  };

  return (
    <aside
      aria-label={lang === 'hi' ? 'सुपाबेस डेटाबेस सेटअप सूचना' : 'Supabase Database Setup Notice'}
      className="bg-amber-50 border-b border-amber-300 px-4 py-3 text-slate-800 shadow-sm"
    >
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm">
            <p className="font-semibold text-amber-900">
              {lang === 'hi'
                ? 'सुपाबेस डेटाबेस सेटअप आवश्यक है (Tables Pending Migration)'
                : 'Supabase Database Setup Required (Tables Pending Migration)'}
            </p>
            <p className="text-amber-800 text-xs mt-0.5">
              {lang === 'hi'
                ? `प्रोजेक्ट ${SUPABASE_PROJECT_ID} में डेटाबेस टेबल्स अभी निर्मित नहीं हैं। 1-क्लिक में SQL कॉपी करें और Supabase SQL Editor में Run करें।`
                : `Tables are not yet created in project ${SUPABASE_PROJECT_ID}. Copy SQL and execute in the Supabase SQL Editor.`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
          <button
            type="button"
            onClick={handleCopySql}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shadow-sm ${
              copied
                ? 'bg-emerald-600 text-white'
                : 'bg-amber-600 hover:bg-amber-700 text-white active:scale-95'
            }`}
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                {lang === 'hi' ? 'SQL कॉपी हो गया!' : 'SQL Copied!'}
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                {lang === 'hi' ? 'SQL स्कीमा कॉपी करें' : 'Copy SQL Schema'}
              </>
            )}
          </button>

          <a
            href={SUPABASE_SQL_EDITOR_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition-colors shadow-sm"
          >
            <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
            {lang === 'hi' ? 'SQL Editor खोलें' : 'Open SQL Editor'}
          </a>

          <button
            type="button"
            onClick={handleCheckAgain}
            disabled={isChecking}
            title={lang === 'hi' ? 'पुनः जांचें' : 'Check again'}
            className="p-1.5 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-amber-100 transition-colors"
            aria-label="Dismiss notice"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};
