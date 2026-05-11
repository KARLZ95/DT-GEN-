import React, { useRef, useState } from 'react';
import { Upload, CheckCircle, X, File as FileIcon, Plus } from 'lucide-react';

interface FileUploadZoneProps {
  label: string;
  id: string;
  accept: string;
  onFileSelect: (files: File[]) => void;
  selectedFiles: File[];
}

export const FileUploadZone: React.FC<FileUploadZoneProps> = ({ label, id, accept, onFileSelect, selectedFiles }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    // Empêche l'ouverture du sélecteur si on clique sur un bouton de suppression
    if ((e.target as HTMLElement).closest('button')) return;
    inputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      // Ajout des nouveaux fichiers à la liste existante
      onFileSelect([...selectedFiles, ...newFiles]);
      // Reset de l'input pour permettre de resélectionner le même fichier si besoin
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemoveFile = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const newFiles = [...selectedFiles];
    newFiles.splice(index, 1);
    onFileSelect(newFiles);
  };

  // --- DRAG & DROP HANDLERS ---
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Evite le clignotement si on survole un élément enfant
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      // On accepte tous les fichiers déposés, le service de parsing filtrera/gérera les erreurs
      onFileSelect([...selectedFiles, ...droppedFiles]);
      e.dataTransfer.clearData();
    }
  };

  const getContainerClass = () => {
    const base = "relative border-2 border-dashed rounded-xl p-6 transition-all cursor-pointer flex flex-col items-center justify-center min-h-[160px]";
    
    if (isDragging) {
      return `${base} border-[#F7B17D] bg-orange-50 scale-[1.02] shadow-lg ring-2 ring-[#F7B17D]/20`;
    }
    
    if (selectedFiles.length > 0) {
      return `${base} border-emerald-500 bg-emerald-50/30`;
    }
    
    return `${base} border-gray-300 hover:border-[#F7B17D] bg-white hover:bg-gray-50`;
  };

  return React.createElement(
    'div',
    {
      onClick: handleClick,
      onDragOver: handleDragOver,
      onDragEnter: handleDragEnter,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
      className: getContainerClass(),
    },
    React.createElement('input', {
      type: 'file',
      id: id,
      ref: inputRef,
      onChange: handleFileChange,
      accept: accept,
      className: 'hidden',
      multiple: true, // Active la sélection multiple
    }),
    
    selectedFiles.length > 0
      ? React.createElement(
          'div',
          { className: 'w-full flex flex-col gap-3 pointer-events-none' }, // pointer-events-none pour éviter DragLeave intempestif
          // Liste des fichiers
          selectedFiles.map((file, index) => 
            React.createElement(
              'div',
              { 
                key: `${file.name}-${index}`,
                className: 'flex items-center gap-3 bg-white p-3 rounded-lg shadow-sm border border-emerald-100 relative group pointer-events-auto' // Réactivation pointer-events pour les boutons
              },
              React.createElement(FileIcon, { className: 'w-5 h-5 text-emerald-600 flex-shrink-0' }),
              React.createElement(
                'div',
                { className: 'flex-grow min-w-0' },
                React.createElement('p', { className: 'text-sm font-medium text-gray-700 truncate' }, file.name),
                React.createElement('p', { className: 'text-xs text-gray-400' }, `${(file.size / 1024).toFixed(0)} KB`)
              ),
              React.createElement(
                'button',
                {
                  onClick: (e) => handleRemoveFile(index, e),
                  className: 'p-1 hover:bg-red-50 rounded-full text-gray-400 hover:text-red-500 transition-colors pointer-events-auto',
                  title: 'Supprimer'
                },
                React.createElement(X, { className: 'w-4 h-4' })
              )
            )
          ),
          // Bouton Ajouter plus
          React.createElement(
            'div',
            { className: 'flex items-center justify-center gap-2 text-emerald-600 text-sm font-medium mt-2' },
            React.createElement(Plus, { className: 'w-4 h-4' }),
            'Ajouter d\'autres fichiers'
          )
        )
      : React.createElement(
          React.Fragment,
          null,
          React.createElement(Upload, { className: `w-12 h-12 mb-2 transition-colors ${isDragging ? 'text-[#F7B17D] animate-bounce' : 'text-gray-400'}` }),
          React.createElement('p', { className: 'text-sm font-semibold text-gray-700 text-center' }, isDragging ? "Lâchez les fichiers ici !" : label),
          React.createElement('p', { className: 'text-xs text-gray-500 mt-1' }, isDragging ? 'PDF, DOCX, TXT acceptés' : 'PDF, DOCX ou texte brut (Glisser-déposer supporté)')
        )
  );
};