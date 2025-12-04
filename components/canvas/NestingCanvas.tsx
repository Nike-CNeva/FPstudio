
import React from 'react';
import { NestLayout, NestResultSheet, Part, Tool, PunchOp } from '../../types';
import { ToolSvg } from '../common/ToolDisplay';

interface NestingCanvasProps {
    activeNest: NestLayout;
    currentNestSheet: NestResultSheet | null | undefined;
    parts: Part[];
    tools: Tool[];
    
    selectedNestPartId?: string | null;
    optimizedOperations?: PunchOp[] | null;
    simulationStep?: number;
}

export const NestingCanvas: React.FC<NestingCanvasProps> = ({ 
    activeNest, currentNestSheet, parts, tools,
    selectedNestPartId, optimizedOperations, simulationStep = 0
}) => {
    
    let sheetW = 2500;
    let sheetH = 1250;
    let placedParts = currentNestSheet ? currentNestSheet.placedParts : [];

    if (currentNestSheet) {
        sheetW = currentNestSheet.width;
        sheetH = currentNestSheet.height;
    } else {
         const activeStock = activeNest.settings.availableSheets.find(s => s.id === activeNest.settings.activeSheetId) || activeNest.settings.availableSheets[0];
         if(activeStock) { sheetW = activeStock.width; sheetH = activeStock.height; }
    }

    const renderOptimizedPath = () => {
        if (!optimizedOperations || optimizedOperations.length < 2) return null;
        let pathD = `M ${optimizedOperations[0].x} ${optimizedOperations[0].y}`;
        for(let i=1; i<optimizedOperations.length; i++) {
            pathD += ` L ${optimizedOperations[i].x} ${optimizedOperations[i].y}`;
        }
        return (
            <path 
                d={pathD} 
                fill="none" 
                stroke="#d69e2e"
                strokeWidth="1" 
                strokeDasharray="4 2"
                vectorEffect="non-scaling-stroke"
                opacity="0.7"
                style={{ pointerEvents: 'none' }}
            />
        );
    };

    const renderOptimizedHead = () => {
        if (!optimizedOperations || optimizedOperations.length === 0) return null;
        const currentOp = optimizedOperations[simulationStep];
        if (!currentOp) return null;
        return (
            <g transform={`translate(${currentOp.x}, ${currentOp.y})`}>
                <line x1="-15" y1="0" x2="15" y2="0" stroke="cyan" strokeWidth="2" vectorEffect="non-scaling-stroke"/>
                <line x1="0" y1="-15" x2="0" y2="15" stroke="cyan" strokeWidth="2" vectorEffect="non-scaling-stroke"/>
                <circle r="5" stroke="cyan" strokeWidth="1" fill="none" vectorEffect="non-scaling-stroke"/>
            </g>
        )
    };

    return (
        <g>
            <rect x="0" y="0" width={sheetW} height={sheetH} fill="#2d3748" fillOpacity="0.8" stroke="#4a5568" strokeWidth="2" vectorEffect="non-scaling-stroke"/>
            
            <g transform={`translate(0, 0)`}>
                 <line x1="0" y1="0" x2="100" y2="0" stroke="lime" strokeWidth="2" vectorEffect="non-scaling-stroke"/>
                 <line x1="0" y1="0" x2="0" y2="100" stroke="lime" strokeWidth="2" vectorEffect="non-scaling-stroke"/>
                 <g transform="scale(1, -1)">
                     <text x="10" y="-10" fill="lime" fontSize="20" fontWeight="bold">X</text>
                     <text x="5" y="-80" fill="lime" fontSize="20" fontWeight="bold">Y</text>
                 </g>
                 <circle cx="0" cy="0" r="4" fill="lime" vectorEffect="non-scaling-stroke"/>
            </g>

            {activeNest.settings.clampPositions.map((cx, i) => (
                <g key={i} transform={`translate(${cx}, 0)`}>
                    <rect x="-40" y="-50" width="80" height="50" fill="#a0aec0" stroke="#718096" strokeWidth="1" opacity="0.8" vectorEffect="non-scaling-stroke" />
                    <rect x="-40" y="0" width="80" height="20" fill="#718096" vectorEffect="non-scaling-stroke" />
                    <g transform="scale(1, -1)">
                        <text x="0" y="20" textAnchor="middle" fill="#2d3748" fontSize="12" fontWeight="bold">{i+1}</text>
                    </g>
                </g>
            ))}

            {placedParts.map(pp => {
                const part = parts.find(p => p.id === pp.partId);
                if(!part) return null;
                const isSelected = selectedNestPartId === pp.id;

                return (
                    <g 
                        key={pp.id} 
                        transform={`translate(${pp.x} ${pp.y}) rotate(${pp.rotation})`}
                        className={isSelected ? "opacity-100" : "opacity-90"}
                    >
                        <path 
                            d={part.geometry.path} 
                            fill={isSelected ? "#3182ce" : "#4a5568"} 
                            stroke={isSelected ? "#63b3ed" : "#a0aec0"} 
                            strokeWidth={isSelected ? 2 : 1} 
                            vectorEffect="non-scaling-stroke"
                        />
                        
                        {part.punches.map(punch => {
                            const tool = tools.find(t => t.id === punch.toolId);
                            if (!tool) return null;
                            
                            let simStatus: 'pending' | 'active' | 'done' = 'pending';
                            if (optimizedOperations) {
                                const currentCompositeId = `${pp.id}_${punch.id}`;
                                const opIndex = optimizedOperations.findIndex(op => op.compositeId === currentCompositeId);
                                if (opIndex !== -1) {
                                    if (opIndex < simulationStep) simStatus = 'done';
                                    else if (opIndex === simulationStep) simStatus = 'active';
                                    else simStatus = 'pending';
                                }
                            }

                            return (
                                <g 
                                    key={punch.id} 
                                    transform={`translate(${punch.x}, ${punch.y}) rotate(${punch.rotation})`}
                                >
                                    <g 
                                        className={
                                            simStatus === 'done' ? '' : 
                                            (simStatus === 'active' ? 'text-white drop-shadow-[0_0_5px_cyan] animate-pulse' : 
                                            (optimizedOperations ? 'text-gray-600' : 'text-[#f6e05e]'))
                                        }
                                        style={
                                            simStatus === 'done' 
                                                ? { fill: '#111827', stroke: '#374151', strokeWidth: 0.5 }
                                                : (simStatus === 'active' ? { fill: 'cyan', stroke: 'white' } : {})
                                        }
                                    >
                                        <ToolSvg tool={tool} />
                                    </g>
                                </g>
                            )
                        })}

                        <g transform={`translate(${part.geometry.width / 2}, ${part.geometry.height / 2}) rotate(${-pp.rotation}) scale(1, -1)`}>
                            <text textAnchor="middle" dominantBaseline="middle" className="text-xs fill-white font-bold select-none pointer-events-none" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
                                {part.name}
                            </text>
                        </g>
                        
                        {isSelected && <rect x={-2} y={-2} width={part.geometry.width + 4} height={part.geometry.height + 4} fill="none" stroke="yellow" strokeWidth="2" strokeDasharray="4 2" vectorEffect="non-scaling-stroke"/>}
                    </g>
                )
            })}
            
            {renderOptimizedPath()}
            {renderOptimizedHead()}
        </g>
    );
};
