
import React from 'react';
import { Part, Tool, Point, ManualPunchMode, PlacementReference, PlacementSide, SnapMode } from '../../types';
import { ToolSvg } from '../common/ToolDisplay';
import { ProcessedGeometry, findSnapPoint } from '../../services/geometry';
import { useGhostPreview } from '../../hooks/useGhostPreview';

interface PartEditorCanvasProps {
    activePart: Part;
    processedGeometry: ProcessedGeometry | null;
    tools: Tool[];
    mousePos: Point | null;
    
    // Manual Punching State
    manualPunchMode: ManualPunchMode;
    punchCreationStep: number;
    punchCreationPoints: Point[];
    selectedToolId: string | null;
    selectedPunchId: string | null;
    
    placementReference: PlacementReference;
    placementSide: PlacementSide;
    punchOrientation: number;
    punchOffset: number;
    snapMode: SnapMode;
    nibbleSettings: any;
    
    // Teach Mode
    teachMode: boolean;
    selectedSegmentIds: number[];
    selectedTeachPunchIds: string[];
    onSelectPunch: (id: string) => void;
}

export const PartEditorCanvas: React.FC<PartEditorCanvasProps> = ({
    activePart, processedGeometry, tools, mousePos,
    manualPunchMode, punchCreationStep, punchCreationPoints, selectedToolId, selectedPunchId,
    placementReference, placementSide, punchOrientation, punchOffset, snapMode, nibbleSettings,
    teachMode, selectedSegmentIds, selectedTeachPunchIds, onSelectPunch
}) => {
    
    const selectedTool = tools.find(t => t.id === selectedToolId);

    const { ghostPunches, ghostLine, snapPoint } = useGhostPreview({
        mousePos, activePart, processedGeometry, selectedTool, manualPunchMode, snapMode, 
        punchOrientation, punchOffset, nibbleSettings, punchCreationStep, teachMode
    });

    const getArcPath = (seg: any): string => {
        if (!seg.radius || !seg.center) return `M ${seg.p1.x} ${seg.p1.y} L ${seg.p2.x} ${seg.p2.y}`;
        const r = seg.radius;
        const p1 = seg.p1;
        const p2 = seg.p2;
        
        let largeArc = 0;
        const sweep = 1; // Default CCW in DXF->SVG coords
        
        // Use original entity to get accurate flags
        if (seg.originalEntity && seg.originalEntity.type === 'ARC') {
            const arc = seg.originalEntity;
            let diff = arc.endAngle - arc.startAngle;
            if (diff < 0) diff += 360;
            largeArc = diff > 180 ? 1 : 0;
        }

        return `M ${p1.x} ${p1.y} A ${r} ${r} 0 ${largeArc} ${sweep} ${p2.x} ${p2.y}`;
    };

    const renderTeachModeHighlights = () => {
        if (!teachMode || !processedGeometry) return null;
        return processedGeometry.segments.map((seg, idx) => {
            const isSelected = selectedSegmentIds.includes(idx);
            let pathD = seg.type === 'line' ? `M ${seg.p1.x} ${seg.p1.y} L ${seg.p2.x} ${seg.p2.y}` : getArcPath(seg);
            return (
                <g key={idx} className="cursor-pointer group">
                    <path d={pathD} stroke="transparent" strokeWidth="10" fill="none" vectorEffect="non-scaling-stroke"/>
                    <path d={pathD} stroke={isSelected ? "#ec4899" : "transparent"} strokeWidth="3" fill="none" vectorEffect="non-scaling-stroke" className={isSelected ? "" : "group-hover:stroke-purple-500/50"}/>
                </g>
            );
        });
    };

    const renderGhostGeometry = () => {
        if (!mousePos) return null;
        // Destruct line start to mouse
        if (manualPunchMode === ManualPunchMode.Destruct && punchCreationStep > 0) {
            const startPoint = punchCreationPoints[0];
            const finalPoint = findSnapPoint(mousePos, processedGeometry, snapMode)?.point ?? mousePos;
             return <line x1={startPoint.x} y1={startPoint.y} x2={finalPoint.x} y2={finalPoint.y} stroke="yellow" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray="4 2" />
        }
        return null;
    };

    return (
        <g>
            <path d={activePart.geometry.path} fill="rgba(31, 41, 55, 0.5)" stroke="#63b3ed" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            
            {teachMode && renderTeachModeHighlights()}
            
            {activePart.punches.map(punch => {
                const tool = tools.find(t => t.id === punch.toolId);
                if(!tool) return null;
                const isSelected = teachMode ? selectedTeachPunchIds.includes(punch.id) : punch.id === selectedPunchId;
                const isGrouped = !!punch.lineId;
                return (
                <g key={punch.id} transform={`translate(${punch.x}, ${punch.y}) rotate(${punch.rotation})`} onClick={(e) => { e.stopPropagation(); onSelectPunch(punch.id); }} className="cursor-pointer">
                    {isSelected && <rect x={-tool.width/2-2} y={-tool.height/2-2} width={tool.width+4} height={tool.height+4} fill="none" stroke={teachMode ? "#ec4899" : "cyan"} strokeWidth="2" vectorEffect="non-scaling-stroke" />}
                    <path d="M -2 0 L 2 0 M 0 -2 L 0 2" stroke={isSelected ? (teachMode ? "#ec4899" : "cyan") : "red"} strokeWidth="0.5" vectorEffect="non-scaling-stroke"/>
                    <g opacity={isSelected ? 1 : 0.7}><ToolSvg tool={tool} /></g>
                    {isGrouped && isSelected && !teachMode && <circle r="2" fill="yellow" cy="-5"/>}
                </g>
                )
            })}
            
            {renderGhostGeometry()}
            
            {/* Render Ghost Tools from Hook */}
            {selectedTool && ghostPunches.length > 0 && (
                <g opacity="0.6" style={{ pointerEvents: 'none' }}>
                    {ghostPunches.map((p, idx) => (
                        <g key={idx} transform={`translate(${p.x}, ${p.y}) rotate(${p.rotation})`}>
                            <ToolSvg tool={selectedTool} />
                        </g>
                    ))}
                    {ghostLine && (
                        <line x1={ghostLine.x1} y1={ghostLine.y1} x2={ghostLine.x2} y2={ghostLine.y2} stroke="cyan" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeDasharray="5 5"/>
                    )}
                    {snapPoint && (
                        <circle cx={snapPoint.x} cy={snapPoint.y} r="5" fill="none" stroke="cyan" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                    )}
                </g>
            )}
        </g>
    );
};
