import React from 'react';

export const NavButton: React.FC<{ icon: React.ReactNode, label: string, active: boolean, onClick: () => void }> = ({ icon, label, active, onClick }) => (
    <button onClick={onClick} className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${active ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'}`}>
        {icon}
        <span>{label}</span>
    </button>
);

export const SidebarTabButton: React.FC<{ label: string, active: boolean, onClick: () => void }> = ({ label, active, onClick }) => (
    <button onClick={onClick} className={`flex-1 py-2 text-sm font-semibold text-center transition-colors ${active ? 'text-white border-b-2 border-blue-500' : 'text-gray-400 hover:bg-gray-600/50'}`}>
        {label}
    </button>
);

export const ActionButton: React.FC<{ icon: React.ReactNode, label: string, onClick: () => void, disabled?: boolean }> = ({ icon, label, onClick, disabled }) => (
    <button onClick={onClick} disabled={disabled} className="flex items-center space-x-2 text-sm px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded-md transition-colors disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed">
        {icon}
        <span>{label}</span>
    </button>
);

export const FilterButton: React.FC<{ label: string; active: boolean; onClick: () => void; }> = ({ label, active, onClick }) => (
    <button onClick={onClick} className={`px-3 py-1 text-sm rounded-md transition-colors ${active ? 'bg-blue-600 text-white font-semibold' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
        {label}
    </button>
);
