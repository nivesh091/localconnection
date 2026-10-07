import React from 'react';
import { GetHelpCard } from '../components/GetHelpCard';

export const HelpPage: React.FC = () => {
  return (
    <div className="pb-24 pt-4 px-3 max-w-xl mx-auto space-y-4">
      <GetHelpCard showCallHelpline={true} />
    </div>
  );
};
