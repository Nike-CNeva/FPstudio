
import React, { useState, useEffect } from 'react';
import { ParametricScript, Tool, Part, PartProfile, ScheduledPart } from '../types';
import { TrashIcon, PlusIcon } from './Icons';
import { SidebarTabButton } from './common/Button';
import { executeParametricScript } from '../services/scriptExecutor';
import { generateId, generatePartNameFromProfile } from '../utils/helpers';
import { ExcelImportModal } from './ExcelImportModal';
import { detectPartProfile } from '../services/geometry';
import { ModalInputField } from './common/InputField';
import { ScriptList } from './scripts/ScriptList';
import { useScriptFilter } from '../hooks/library/useScriptFilter';

interface ScriptLibraryViewProps {
    scripts: ParametricScript[];
    tools: Tool[];
    parts: Part[];
    onSaveScript: (script: ParametricScript) => void;
    onDeleteScript: (id: string) => void;
    onCreatePart: (part: Part) => void;
    onBatchProcess: (newParts: Part[], scheduledParts: ScheduledPart[]) => void;
}

export const ScriptLibraryView: React.FC<ScriptLibraryViewProps> = ({ 
    scripts, tools, onSaveScript, onDeleteScript, onCreatePart, onBatchProcess 
}) => {
    const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);
    const { searchQuery, setSearchQuery, filteredScripts } = useScriptFilter(scripts);
    const [activeTab, setActiveTab] = useState<'run' | 'edit'>('run');

    // Run State
    const [runWidth, setRunWidth] = useState(500);
    const [runHeight, setRunHeight] = useState(300);
    const [profileType, setProfileType] = useState<PartProfile['type']>('flat');
    const [orientation, setOrientation] = useState<PartProfile['orientation']>('vertical');
    const [dims, setDims] = useState({ a: 100, b: 300, c: 100 });
    const [previewPart, setPreviewPart] = useState<Part | null>(null);
    const [previewError, setPreviewError] = useState<string | null>(null);

    // Edit State
    const [editCode, setEditCode] = useState('');
    const [editName, setEditName] = useState('');

    const [showExcelModal, setShowExcelModal] = useState(false);
    const selectedScript = scripts.find(s => s.id === selectedScriptId);

    useEffect(() => {
        if (selectedScript) {
            const code = selectedScript.code;
            let newType: PartProfile['type'] = 'flat';
            let newOrient: PartProfile['orientation'] = 'vertical';

            if (code.includes('// L-Profile Vertical') || code.includes('L-профиль (vertical)')) {
                newType = 'L'; newOrient = 'vertical';
            } else if (code.includes('// L-Profile Horizontal') || code.includes('L-профиль (horizontal)')) {
                newType = 'L'; newOrient = 'horizontal';
            } else if (code.includes('// U-Profile Vertical') || code.includes('U-профиль (vertical)')) {
                newType = 'U'; newOrient = 'vertical';
            } else if (code.includes('// U-Profile Horizontal') || code.includes('U-профиль (horizontal)')) {
                newType = 'U'; newOrient = 'horizontal';
            }

            setProfileType(newType);
            setOrientation(newOrient);
            setRunWidth(selectedScript.defaultWidth);
            setRunHeight(selectedScript.defaultHeight);
            const initA = Math.floor(selectedScript.defaultWidth / 3) || 50;
            setDims({ a: initA, b: Math.floor(selectedScript.defaultWidth / 3) || 50, c: initA });
            setEditCode(selectedScript.code);
            setEditName(selectedScript.name);
        } else {
            setPreviewPart(null);
        }
    }, [selectedScriptId]);

    useEffect(() => {
        if (!selectedScript) return;
        let newW = runWidth, newH = runHeight;
        if (profileType === 'L') {
            if (orientation === 'vertical') newW = dims.a + dims.b; else newH = dims.a + dims.b;
        } else if (profileType === 'U') {
            if (orientation === 'vertical') newW = dims.a + dims.b + dims.c; else newH = dims.a + dims.b + dims.c;
        }
        if (newW !== runWidth || newH !== runHeight) { setRunWidth(newW); setRunHeight(newH); }
        generatePreview(editCode, newW, newH, dims);
    }, [dims, profileType, orientation]); 

    const generatePreview = (code: string, w: number, h: number, parameters: any) => {
        try {
            const basePart: Part = {
                id: 'temp_preview', name: 'Preview', faceWidth: w, faceHeight: h,
                geometry: { path: '', width: w, height: h, entities: [], bbox: {minX:0,minY:0,maxX:w,maxY:h} },
                punches: [], material: { code: 'St-3', thickness: 1, dieClearance: 0.2 },
                nesting: { allow0_180: true, allow90_270: true, initialRotation: 0, commonLine: false, canMirror: false }
            };
            setPreviewPart(executeParametricScript(basePart, code, tools, w, h, parameters));
            setPreviewError(null);
        } catch (e: any) { setPreviewError(e.message); setPreviewPart(null); }
    };

    const handleManualSizeChange = (w: number, h: number) => {
        if (profileType === 'flat') { setRunWidth(w); setRunHeight(h); generatePreview(editCode, w, h, dims); } 
        else {
            if (orientation === 'vertical') { setRunHeight(h); generatePreview(editCode, runWidth, h, dims); } 
            else { setRunWidth(w); generatePreview(editCode, w, runHeight, dims); }
        }
    };

    const handleCreateConcretePart = () => {
        if (previewPart && selectedScript) {
            const profile = { type: profileType, orientation: orientation, dims: { ...dims } };
            const partName = generatePartNameFromProfile(selectedScript.name, profile, runWidth, runHeight);
            const newPart = { ...previewPart, id: generateId(), name: partName, profile: profile };
            if (profileType === 'flat') newPart.profile = detectPartProfile(newPart.geometry);
            onCreatePart(newPart);
        }
    };

    const handleSaveEdit = () => {
        if (selectedScript) {
            onSaveScript({ ...selectedScript, name: editName, code: editCode, defaultWidth: runWidth, defaultHeight: runHeight, updatedAt: Date.now() });
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Delete' && selectedScriptId) { onDeleteScript(selectedScriptId); setSelectedScriptId(null); }
    };

    const getLabel = (key: 'a'|'b'|'c') => {
        if (orientation === 'vertical') {
            if (profileType === 'L') return key === 'a' ? 'Левая (A)' : 'Правая (B)';
            if (profileType === 'U') return key === 'a' ? 'Левая (A)' : key === 'b' ? 'Центр (B)' : 'Правая (C)';
        } else {
            if (profileType === 'L') return key === 'a' ? 'Верх (A)' : 'Низ (B)';
            if (profileType === 'U') return key === 'a' ? 'Верх (A)' : key === 'b' ? 'Центр (B)' : 'Низ (C)';
        }
        return key.toUpperCase();
    };

    return (
        <main className="flex-1 bg-gray-800 flex overflow-hidden h-full" onKeyDown={handleKeyDown} tabIndex={0}>
            <ScriptList 
                scripts={filteredScripts}
                selectedScriptId={selectedScriptId}
                onSelect={setSelectedScriptId}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onExcelImportClick={() => setShowExcelModal(true)}
            />

            <div className="flex-1 flex flex-col bg-gray-800 relative">
                {selectedScript ? (
                    <div className="flex flex-col h-full">
                        <div className="flex-none p-4 bg-gray-800 border-b border-gray-700 flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-bold text-white">{editName}</h2>
                                <div className="flex items-center space-x-2 mt-1">
                                    {profileType !== 'flat' && (
                                        <span className="px-2 py-0.5 rounded bg-blue-900/50 border border-blue-700 text-[10px] text-blue-200 font-mono">
                                            {profileType}-Профиль ({orientation})
                                        </span>
                                    )}
                                </div>
                            </div>
                            <button onClick={() => { onDeleteScript(selectedScript.id); setSelectedScriptId(null); }} className="text-red-500 hover:text-red-400 p-2"><TrashIcon className="w-5 h-5"/></button>
                        </div>

                        <div className="flex border-b border-gray-700 px-4">
                            <SidebarTabButton label="Генератор" active={activeTab === 'run'} onClick={() => setActiveTab('run')} />
                            <SidebarTabButton label="Код" active={activeTab === 'edit'} onClick={() => setActiveTab('edit')} />
                        </div>

                        <div className="flex-1 overflow-hidden flex flex-col">
                            {activeTab === 'run' && (
                                <div className="flex flex-col h-full p-4 space-y-4">
                                    <div className="flex-none bg-gray-700/50 p-4 rounded border border-gray-600">
                                        <div className="flex space-x-4 items-end">
                                            {profileType === 'flat' ? (
                                                <>
                                                    <div className="flex-1"><ModalInputField label="Ширина (X)" type="number" value={runWidth} onChange={e => handleManualSizeChange(parseFloat(e.target.value)||0, runHeight)} /></div>
                                                    <div className="flex-1"><ModalInputField label="Высота (Y)" type="number" value={runHeight} onChange={e => handleManualSizeChange(runWidth, parseFloat(e.target.value)||0)} /></div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="flex-[2] grid grid-cols-3 gap-2">
                                                        <ModalInputField label={getLabel('a')} type="number" value={dims.a} onChange={e => setDims(d => ({...d, a: parseFloat(e.target.value)||0}))} />
                                                        <ModalInputField label={getLabel('b')} type="number" value={dims.b} onChange={e => setDims(d => ({...d, b: parseFloat(e.target.value)||0}))} />
                                                        {profileType === 'U' && <ModalInputField label={getLabel('c')} type="number" value={dims.c} onChange={e => setDims(d => ({...d, c: parseFloat(e.target.value)||0}))} />}
                                                    </div>
                                                    <div className="flex-1 border-l border-gray-600 pl-4">
                                                        {orientation === 'vertical' ? 
                                                            <ModalInputField label="Высота (Y)" type="number" value={runHeight} onChange={e => handleManualSizeChange(runWidth, parseFloat(e.target.value)||0)} /> : 
                                                            <ModalInputField label="Ширина (X)" type="number" value={runWidth} onChange={e => handleManualSizeChange(parseFloat(e.target.value)||0, runHeight)} />
                                                        }
                                                    </div>
                                                </>
                                            )}
                                            <button onClick={handleCreateConcretePart} className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded font-bold shadow-lg flex items-center h-10">
                                                <PlusIcon className="w-5 h-5 mr-2"/> Создать
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex-1 bg-gray-900 border-2 border-dashed border-gray-600 rounded flex items-center justify-center relative overflow-hidden">
                                        {previewError ? <pre className="text-red-400 text-xs p-4">{previewError}</pre> : previewPart && (
                                            <svg viewBox={`-10 ${-(previewPart.geometry.height + 10)} ${previewPart.geometry.width + 20} ${previewPart.geometry.height + 20}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
                                                <defs>
                                                    <pattern id="smallGridPreview" width="10" height="10" patternUnits="userSpaceOnUse">
                                                        <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(255, 255, 255, 0.05)" strokeWidth="0.5"/>
                                                    </pattern>
                                                    <pattern id="gridPreview" width="100" height="100" patternUnits="userSpaceOnUse">
                                                        <rect width="100" height="100" fill="url(#smallGridPreview)"/>
                                                        <path d="M 100 0 L 0 0 0 100" fill="none" stroke="rgba(255, 255, 255, 0.15)" strokeWidth="1"/>
                                                    </pattern>
                                                </defs>
                                                <rect x="-5000" y="-5000" width="10000" height="10000" fill="url(#gridPreview)" />
                                                <g transform="scale(1, -1)">
                                                    <rect x="0" y="0" width={previewPart.geometry.width} height={previewPart.geometry.height} fill="#2d3748" stroke="#4a5568" strokeWidth="1"/>
                                                    <path d={previewPart.geometry.path} fill="none" stroke="#63b3ed" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                                                    {previewPart.punches.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="2" fill="yellow" opacity="0.8" />)}
                                                </g>
                                            </svg>
                                        )}
                                    </div>
                                </div>
                            )}
                            {activeTab === 'edit' && (
                                <div className="flex flex-col h-full p-4 space-y-4">
                                    <textarea value={editCode} onChange={e => { setEditCode(e.target.value); generatePreview(e.target.value, runWidth, runHeight, dims); }} className="flex-1 bg-gray-900 font-mono text-sm text-gray-300 p-4 rounded border border-gray-600 focus:border-purple-500 outline-none resize-none" spellCheck={false} />
                                    <div className="flex justify-end"><button onClick={handleSaveEdit} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded font-bold">Сохранить изменения</button></div>
                                </div>
                            )}
                        </div>
                    </div>
                ) : <div className="flex items-center justify-center h-full text-gray-500">Выберите скрипт</div>}
            </div>

            {showExcelModal && (
                <ExcelImportModal 
                    onClose={() => setShowExcelModal(false)} 
                    scripts={scripts}
                    parts={[]}
                    tools={tools}
                    onProcess={onBatchProcess}
                />
            )}
        </main>
    );
};
