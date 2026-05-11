
import React, { useState } from 'react';
import { LOGO_URL } from '../constants';

export const Logo: React.FC<{ className?: string }> = ({ className }) => {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className={`${className} flex items-center justify-center border border-white/20 rounded bg-white/10 text-white font-bold text-xs p-1 tracking-wider`}>
        5 DEGRÉS
      </div>
    );
  }

  return (
    <img 
      src={LOGO_URL} 
      alt="Logo 5 Degrés" 
      className={className}
      referrerPolicy="no-referrer"
      onError={(e) => {
        console.error("Erreur chargement logo:", LOGO_URL);
        setError(true);
      }}
    />
  );
};
