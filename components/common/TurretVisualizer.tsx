
import React from 'react';
import { Tool, StationConfig } from '../../types';
import { ToolSvg } from './ToolDisplay';

interface TurretVisualizerProps {
    stations: StationConfig[];
    tools: Tool[]; // Tools currently on turret (filtered)
    selectedStationId: number | null;
    onStationClick: (id: number) => void;
    mode: 'setup' | 'control'; // 'setup' shows config types, 'control' focuses on tools
}

export const TurretVisualizer: React.FC<TurretVisualizerProps> = ({ 
    stations, 
    tools, 
    selectedStationId, 
    onStationClick,
    mode 
}) => {
    return (
        <svg 
            width="100%" 
            height="100%" 
            viewBox="-350 -350 700 700"
        >
            <defs>
                <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="2" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.3" />
                </filter>
            </defs>
            
            {/* Base Plate */}
            <circle r="320" fill="#2d3748" stroke="#4a5568" strokeWidth="2" />
            <circle r="300" fill="#cbd5e0" stroke="#718096" strokeWidth="5" filter="url(#shadow)" />
            <circle r="200" fill="#e2e8f0" stroke="#a0aec0" strokeWidth="2" />
            <circle r="100" fill="#edf2f7" stroke="#cbd5e0" strokeWidth="1" />
            
            <text x="0" y="0" textAnchor="middle" dy="5" className="fill-gray-600 text-lg font-bold pointer-events-none select-none">
                Main Turret
            </text>

            {stations.map((s, i) => {
                // Stations typically ordered clockwise or counter-clockwise.
                // Assuming standard layout starting at 90deg (Top) and going CW.
                const step = 360 / stations.length;
                const angleDeg = 90 - (i * step);
                const rad = (angleDeg * Math.PI) / 180;
                const x = Math.cos(rad) * 250;
                const y = Math.sin(rad) * 250;

                const assignedTools = tools.filter(t => t.stationNumber === s.id);
                const hasTools = assignedTools.length > 0;
                const isMT = s.type === 'MT';
                const isSelected = selectedStationId === s.id;

                // Color Logic
                let circleFill = isSelected ? "#f6e05e" : "#fff";
                let circleStroke = isSelected ? "#d69e2e" : "#a0aec0";
                
                // In Control mode, highlight presence of tools
                if (mode === 'control' && !isSelected) {
                    if (hasTools) circleFill = isMT ? "#e9d8fd" : "#bee3f8"; // Light purple / Light blue
                    else circleFill = "#cbd5e0"; // Grayed out
                }

                return (
                    <g 
                        key={s.id} 
                        transform={`translate(${x}, ${y})`} 
                        onClick={(e) => { e.stopPropagation(); onStationClick(s.id); }} 
                        className="cursor-pointer hover:opacity-90 transition-opacity"
                    >
                        <circle r="28" fill={circleFill} stroke={circleStroke} strokeWidth={isSelected ? 4 : 2} />
                        
                        {/* Tool Preview (Only non-MT single tools) */}
                        <g transform="scale(0.9)">
                            {hasTools && !isMT && <ToolSvg tool={assignedTools[0]} />}
                        </g>

                        {/* Tool Name Label */}
                        {hasTools && !isMT && (
                            <text y="-22" textAnchor="middle" className="text-[8px] fill-blue-900 font-bold select-none pointer-events-none" style={{ textShadow: '0px 0px 2px white' }}>
                                {assignedTools[0].name}
                            </text>
                        )}

                        {/* Station Number Badge */}
                        <g transform="translate(0, -38)">
                            <rect x="-12" y="-10" width="24" height="20" rx="4" fill="#fff" stroke="#718096" strokeWidth="1" />
                            <text y="4" textAnchor="middle" className="text-xs fill-gray-900 font-bold select-none pointer-events-none">{s.id}</text>
                        </g>

                        {/* Bottom Label: Type or Status */}
                        <text y="40" textAnchor="middle" className="text-[10px] fill-gray-700 font-bold select-none bg-white pointer-events-none">
                            {isMT ? "MT" : (mode === 'setup' ? `${s.type} ${s.isAutoIndex ? '(AI)' : ''}` : (hasTools ? s.type : ""))}
                        </text>
                        
                        {/* MT Indicator */}
                        {isMT && (
                            <g>
                                <circle r="15" fill="#805ad5" opacity="0.2" />
                                <text y="5" textAnchor="middle" className="text-[10px] fill-purple-800 font-bold pointer-events-none select-none">MT</text>
                                {hasTools && mode === 'control' && (
                                     <text y="18" textAnchor="middle" className="text-[8px] fill-purple-900 font-bold pointer-events-none select-none">
                                         {assignedTools.length}/24
                                     </text>
                                )}
                            </g>
                        )}
                    </g>
                );
            })}
        </svg>
    );
};

interface MtVisualizerProps {
    tools: Tool[]; // Tools specific to this station
    selectedSlotId: number | null;
    onSlotClick: (id: number) => void;
}

export const MtVisualizer: React.FC<MtVisualizerProps> = ({ 
    tools, 
    selectedSlotId, 
    onSlotClick
}) => {
    // 24 slots geometry
    const mtSlots = Array.from({ length: 24 }, (_, i) => {
        const id = i + 1;
        // Slots 1-12 Outer, 13-24 Inner
        const isInner = id > 12;
        const indexInRing = isInner ? id - 13 : id - 1;
        
        // Visual Radius (Scaled for viewBox -150 to 150)
        const radius = isInner ? 84 : 120;
        
        // Angle layout
        let angleDeg = - (indexInRing * 30); 
        if (isInner) angleDeg -= 15;
        
        return { id, angle: angleDeg, radius, isInner };
    });

    return (
        <svg 
            width="100%" 
            height="100%" 
            viewBox="-150 -150 300 300"
        >
             <defs>
                <radialGradient id="greenTool" cx="30%" cy="30%" r="70%">
                    <stop offset="0%" stopColor="#81e6d9" />
                    <stop offset="100%" stopColor="#2c7a7b" />
                </radialGradient>
             </defs>

             {/* Background Plate */}
             <circle r="145" fill="#f3e8ff" stroke="#805ad5" strokeWidth="4" />
             <text x="0" y="-5" textAnchor="middle" className="fill-purple-900 text-lg font-bold pointer-events-none select-none">Multi-Tool</text>
             
             {mtSlots.map(slot => {
                 const rad = (slot.angle * Math.PI) / 180;
                 const x = Math.cos(rad) * slot.radius;
                 const y = Math.sin(rad) * slot.radius;
                 
                 const assignedTool = tools.find(t => t.mtIndex === slot.id);
                 const isSelected = selectedSlotId === slot.id;

                 return (
                    <g 
                        key={slot.id} 
                        transform={`translate(${x}, ${y})`} 
                        onClick={(e) => { e.stopPropagation(); onSlotClick(slot.id); }} 
                        className="cursor-pointer"
                    >
                        <circle r="14" fill={assignedTool ? "#4299e1" : "#fff"} stroke={isSelected ? "#ecc94b" : "#6b46c1"} strokeWidth={isSelected ? 3 : 1} />
                        
                        {/* Tool Indicator */}
                        {assignedTool ? (
                             <circle r="8" fill="url(#greenTool)" />
                        ) : null}

                        <text y="4" textAnchor="middle" className="text-[8px] fill-gray-800 font-bold select-none z-10 pointer-events-none" style={assignedTool ? {fill:'white', textShadow:'0 0 2px black'} : {}}>
                            {slot.id}
                        </text>
                        {assignedTool && <title>{assignedTool.name}</title>}
                    </g>
                 )
             })}
        </svg>
    );
};
