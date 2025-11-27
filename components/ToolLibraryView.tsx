
import React, { useState, useEffect, useRef } from 'react';
import { Tool, ToolShape, PunchType } from '../types';
import { PlusIcon, SaveIcon, TrashIcon, FolderIcon } from './Icons';
import { FilterButton } from './common/Button';
import { ModalInputField } from './common/InputField';
import { getPunchTypeName } from '../utils/helpers';
import { ToolPreview } from './common/ToolDisplay';
import { parseDxf, dxfEntitiesToSvg } from '../services/dxfParser';

const createNewTool = (): Omit<Tool, 'id'> => ({
  name: 'Новый инструмент',
  shape: ToolShape.Circle,
  width: 10,
  height: 10,
  cornerRadius: 0,
  toolSize: 'B',
  description: '',
  punchType: PunchType.General,
  dies: [{ clearance: 0.2 }],
  stripperHeight: 0,
  punchDepth: 0,
  ramSpeed: 0,
  acceleration: 0,
  operatingMode: 'PUNCHING',
  nibblingPriority: 5,
  punchPriority: 5,
  punchCount: 1,
  isAutoIndex: false,
  keyAngles: [],
  optimizingGroup: 'MULTI_1',
  awayFromClamps: false,
  motionPrinciple: 'Minimum distance',
  relievedStripper: 'none',
  yProtectionArea: 47,
  zoneWidth: 25,
  onlyForC5: false,
  stationNumber: 0,
  stationType: 'B',
  mtIndex: 0
});

const ToolForm: React.FC<{
    editingTool: Tool | Omit<Tool, 'id'>, 
    onSave: (tool: Tool) => void, 
    onDelete: (toolId: string) => void,
    onCancel: () => void,
}> = ({ editingTool, onSave, onDelete, onCancel }) => {
    const [formData, setFormData] = useState<Tool | Omit<Tool, 'id'>>(editingTool);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setFormData(JSON.parse(JSON.stringify(editingTool))); // Deep copy
    }, [editingTool]);
    
    useEffect(() => {
        if (formData.shape === ToolShape.Circle || formData.shape === ToolShape.Square) {
           handleFormChange('height', formData.width);
        }
    }, [formData.width, formData.shape]);

    const handleFormChange = (field: keyof Tool, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };
    
    const handleDieChange = (index: number, value: number) => {
        const newDies = [...formData.dies];
        newDies[index] = { clearance: value };
        handleFormChange('dies', newDies);
    };

    const addDie = () => handleFormChange('dies', [...formData.dies, { clearance: 0.2 }]);
    const removeDie = (index: number) => handleFormChange('dies', formData.dies.filter((_, i) => i !== index));

    const handleKeyAngleChange = (angle: number) => {
        const currentAngles = formData.keyAngles;
        const newAngles = currentAngles.includes(angle)
            ? currentAngles.filter(a => a !== angle)
            : [...currentAngles, angle];
        handleFormChange('keyAngles', newAngles.sort((a,b) => a-b));
    }

    const handleSaveClick = () => {
        if (!formData.name.trim()) {
            console.warn("Название инструмента не может быть пустым.");
            return;
        }
        onSave(formData as Tool);
    };

    const handleDxfUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target?.result as string;
            try {
                const parsedEntities = parseDxf(content);
                if (parsedEntities.length > 0) {
                    // Convert to SVG to get bounding box and path
                    const { path, width, height } = dxfEntitiesToSvg(parsedEntities);
                    
                    if (width === 0 || height === 0) {
                        alert("Ошибка: Пустой или некорректный DXF файл.");
                        return;
                    }

                    // Auto-fill width, height and path
                    setFormData(prev => ({
                        ...prev,
                        width: parseFloat(width.toFixed(3)),
                        height: parseFloat(height.toFixed(3)),
                        customPath: path,
                        shape: ToolShape.Special // Ensure special type is set
                    }));
                } else {
                    alert("Не удалось найти геометрию в DXF файле.");
                }
            } catch (error) {
                console.error("DXF Parse Error:", error);
                alert("Ошибка при чтении DXF файла.");
            }
        };
        reader.readAsText(file);
        event.target.value = ''; // Reset input
    };

    const isNew = !('id' in formData);
    const keyAngleOptions = [0, 45, 90, 135, 180, 225, 270, 315];
    const isSpecial = formData.shape === ToolShape.Special;

    return (
        <div className="bg-gray-700 p-4 rounded-lg flex flex-col h-full">
            <h3 className="text-xl font-bold mb-4 border-b border-gray-600 pb-2">{isNew ? 'Создание нового инструмента' : 'Редактирование инструмента'}</h3>
            <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                 <fieldset className="border border-gray-600 p-3 rounded-md">
                    <legend className="px-2 font-semibold text-gray-300">Основная информация</legend>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                             <ModalInputField label="Название" value={formData.name} onChange={e => handleFormChange('name', e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Форма</label>
                            <select value={formData.shape} onChange={e => handleFormChange('shape', e.target.value as ToolShape)} className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                                {Object.values(ToolShape).map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                            </select>
                        </div>
                        
                        {isSpecial ? (
                            <div className="col-span-2 p-3 bg-gray-800 rounded border border-dashed border-gray-500 flex flex-col items-center">
                                <p className="text-xs text-gray-400 mb-2">Загрузите DXF контур инструмента для авто-расчета размеров.</p>
                                <button 
                                    onClick={() => fileInputRef.current?.click()} 
                                    className="px-4 py-2 bg-purple-700 hover:bg-purple-600 rounded text-sm text-white flex items-center space-x-2"
                                >
                                    <FolderIcon className="w-4 h-4"/>
                                    <span>Загрузить DXF (.dxf)</span>
                                </button>
                                <input type="file" ref={fileInputRef} onChange={handleDxfUpload} accept=".dxf" className="hidden" />
                                {formData.customPath && <span className="text-green-400 text-xs mt-2">Контур загружен!</span>}
                            </div>
                        ) : null}

                        <ModalInputField 
                            label="Ширина (X)" 
                            type="number" 
                            value={formData.width} 
                            onChange={e => handleFormChange('width', parseFloat(e.target.value) || 0)} 
                            disabled={isSpecial} // Auto-calculated for Special
                        />
                        <ModalInputField 
                            label="Высота (Y)" 
                            type="number" 
                            value={formData.height} 
                            onChange={e => handleFormChange('height', parseFloat(e.target.value) || 0)} 
                            disabled={formData.shape === ToolShape.Circle || formData.shape === ToolShape.Square || isSpecial} 
                        />
                        
                        {!isSpecial && (
                             <ModalInputField label="Радиус скругления" type="number" value={formData.cornerRadius} onChange={e => handleFormChange('cornerRadius', parseFloat(e.target.value) || 0)} />
                        )}
                        
                        <ModalInputField label="Размер станции" value={formData.toolSize} onChange={e => handleFormChange('toolSize', e.target.value)} />
                        <div className="col-span-2">
                             <label className="block text-sm font-medium text-gray-300 mb-1">Тип инструмента (применение)</label>
                             <select value={formData.punchType} onChange={e => handleFormChange('punchType', e.target.value as PunchType)} className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
                                 {Object.values(PunchType).map(pt => <option key={pt} value={pt}>{getPunchTypeName(pt)}</option>)}
                             </select>
                        </div>
                    </div>
                </fieldset>
                
                {/* Turret Setup */}
                <fieldset className="border border-gray-600 p-3 rounded-md">
                    <legend className="px-2 font-semibold text-gray-300">Настройка Револьвера</legend>
                    <div className="grid grid-cols-2 gap-4">
                         <ModalInputField label="Номер станции (0=авто)" type="number" value={formData.stationNumber || 0} onChange={e => handleFormChange('stationNumber', parseInt(e.target.value) || 0)} />
                         <ModalInputField label="MT Index (для Multi-Tool)" type="number" value={formData.mtIndex || 0} onChange={e => handleFormChange('mtIndex', parseInt(e.target.value) || 0)} />
                         <div className="flex items-center mt-6">
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input type="checkbox" checked={formData.isAutoIndex} onChange={e => handleFormChange('isAutoIndex', e.target.checked)} className="form-checkbox h-4 w-4 text-blue-600 bg-gray-800 border-gray-500" />
                                <span>Auto Index</span>
                            </label>
                         </div>
                    </div>
                </fieldset>

                 <fieldset className="border border-gray-600 p-3 rounded-md">
                    <legend className="px-2 font-semibold text-gray-300">Матрицы</legend>
                    <div className="space-y-2">
                        {formData.dies.map((die, index) => (
                            <div key={index} className="flex items-center space-x-2">
                                <ModalInputField label={`Зазор ${index+1} (мм)`} type="number" value={die.clearance} onChange={e => handleDieChange(index, parseFloat(e.target.value) || 0)} />
                                <button onClick={() => removeDie(index)} className="p-2 bg-red-800 hover:bg-red-700 rounded-md mt-6" disabled={formData.dies.length <= 1}>
                                    <TrashIcon className="w-5 h-5" />
                                </button>
                            </div>
                        ))}
                    </div>
                    <button onClick={addDie} className="mt-3 text-sm flex items-center space-x-2 px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded-md">
                        <PlusIcon className="w-4 h-4"/>
                        <span>Добавить матрицу</span>
                    </button>
                 </fieldset>

                 <fieldset className="border border-gray-600 p-3 rounded-md">
                    <legend className="px-2 font-semibold text-gray-300">Ключи/слоты матрицы</legend>
                    <div className="grid grid-cols-4 gap-2 text-sm">
                        {keyAngleOptions.map(angle => (
                            <label key={angle} className="flex items-center space-x-2 p-2 rounded hover:bg-gray-800 cursor-pointer">
                                <input type="checkbox" checked={formData.keyAngles.includes(angle)} onChange={() => handleKeyAngleChange(angle)} className="form-checkbox h-4 w-4 text-blue-600 bg-gray-800 border-gray-500" />
                                <span>{angle}°</span>
                            </label>
                        ))}
                    </div>
                 </fieldset>
            </div>
            <div className="flex-none pt-4 border-t border-gray-600 flex justify-end space-x-3">
                <button onClick={onCancel} className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md">Отмена</button>
                {!isNew && <button onClick={() => onDelete((formData as Tool).id)} className="px-4 py-2 bg-red-800 hover:bg-red-700 rounded-md">Удалить</button>}
                <button onClick={handleSaveClick} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-md flex items-center space-x-2">
                    <SaveIcon className="w-5 h-5"/>
                    <span>Сохранить</span>
                </button>
            </div>
        </div>
    )
}


export const ToolLibraryView: React.FC<{
    tools: Tool[];
    onSaveTool: (tool: Tool) => void;
    onDeleteTool: (toolId: string) => void;
}> = ({ tools, onSaveTool, onDeleteTool }) => {
    const [toolFilter, setToolFilter] = React.useState<'all' | ToolShape>('all');
    const [editingTool, setEditingTool] = useState<Tool | Omit<Tool, 'id'> | null>(null);
    
    const filteredTools = tools.filter(tool => {
        if (toolFilter === 'all') return true;
        return tool.shape === toolFilter;
    });

    const handleSelectTool = (tool: Tool) => {
        setEditingTool(tool);
    };

    const handleAddNew = () => {
        setEditingTool(createNewTool());
    };

    const handleSave = (tool: Tool) => {
        onSaveTool(tool);
        setEditingTool(null);
    };

    const handleDelete = (toolId: string) => {
        onDeleteTool(toolId);
        setEditingTool(null);
    }
    
    return (
        <main className="flex-1 bg-gray-800 flex p-4 space-x-4">
            {/* Left Column */}
            <div className="w-1/2 lg:w-1/3 flex flex-col space-y-4">
                <div className="flex-none flex justify-between items-center border-b border-gray-600 pb-3">
                    <h2 className="text-2xl font-bold">Библиотека</h2>
                    <button onClick={handleAddNew} className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-md font-semibold transition-colors">
                        <PlusIcon className="w-5 h-5"/>
                        <span>Новый...</span>
                    </button>
                </div>
                <div className="flex-none flex items-center space-x-2 bg-gray-900/50 p-2 rounded-md overflow-x-auto">
                    <span className="font-semibold text-gray-300 text-sm whitespace-nowrap">Фильтр:</span>
                    <FilterButton label="Все" active={toolFilter === 'all'} onClick={() => setToolFilter('all')} />
                    <FilterButton label="Круг" active={toolFilter === ToolShape.Circle} onClick={() => setToolFilter(ToolShape.Circle)} />
                    <FilterButton label="Квадрат" active={toolFilter === ToolShape.Square} onClick={() => setToolFilter(ToolShape.Square)} />
                    <FilterButton label="Прямоугольник" active={toolFilter === ToolShape.Rectangle} onClick={() => setToolFilter(ToolShape.Rectangle)} />
                    <FilterButton label="Овал" active={toolFilter === ToolShape.Oblong} onClick={() => setToolFilter(ToolShape.Oblong)} />
                    <FilterButton label="Спец." active={toolFilter === ToolShape.Special} onClick={() => setToolFilter(ToolShape.Special)} />
                </div>
                <div className="flex-1 overflow-y-auto pr-2">
                     <div className="space-y-2">
                        {filteredTools.map(tool => (
                             <div 
                                key={tool.id} 
                                className={`p-2 rounded-md flex items-center space-x-3 cursor-pointer transition-all ${editingTool && 'id' in editingTool && editingTool.id === tool.id ? 'bg-blue-600 ring-2 ring-blue-300' : 'bg-gray-700 hover:bg-gray-600'}`} 
                                onClick={() => handleSelectTool(tool)}
                            >
                                <div className="w-10 h-10 flex items-center justify-center scale-75 flex-shrink-0 bg-gray-800 rounded">
                                   <ToolPreview tool={tool}/>
                                </div>
                                <div>
                                    <p className="font-bold truncate">{tool.name}</p>
                                    <p className="text-xs text-gray-400">
                                        {tool.shape === ToolShape.Circle ? `Ø${tool.width}` : `${tool.width}x${tool.height}`} мм
                                    </p>
                                </div>
                            </div>
                        ))}
                     </div>
                     {filteredTools.length === 0 && (
                        <div className="flex items-center justify-center h-full text-gray-500 text-center p-4">
                            <p>Инструменты не найдены. <br/> Попробуйте изменить фильтр или добавить новый инструмент.</p>
                        </div>
                     )}
                </div>
            </div>

            {/* Right Column */}
            <div className="w-1/2 lg:w-2/3">
                {editingTool ? (
                    <ToolForm 
                        editingTool={editingTool} 
                        onSave={handleSave} 
                        onDelete={handleDelete}
                        onCancel={() => setEditingTool(null)}
                    />
                ) : (
                    <div className="flex items-center justify-center h-full bg-gray-900/30 border-2 border-dashed border-gray-600 rounded-lg text-gray-500">
                        <p>Выберите инструмент для редактирования или создайте новый.</p>
                    </div>
                )}
            </div>
        </main>
    );
};
