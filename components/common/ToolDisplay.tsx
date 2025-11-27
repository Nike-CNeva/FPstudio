
import React from 'react';
import { Tool, ToolShape } from '../../types';

export const ToolSvg: React.FC<{ tool: Tool }> = ({ tool }) => {
    const props = {
      stroke: '#f6e05e',
      fill: 'rgba(246, 224, 94, 0.3)',
      strokeWidth: "1.5",
      vectorEffect: "non-scaling-stroke" as const,
    };
    
    switch (tool.shape) {
      case ToolShape.Circle:
        return <circle cx="0" cy="0" r={tool.width / 2} {...props} />;
      case ToolShape.Square:
        return <rect x={-tool.width / 2} y={-tool.height / 2} width={tool.width} height={tool.height} {...props} />;
      case ToolShape.Rectangle:
        return <rect x={-tool.width / 2} y={-tool.height / 2} width={tool.width} height={tool.height} {...props} />;
      case ToolShape.Oblong:
        const radius = Math.min(tool.width, tool.height) / 2;
        return <rect x={-tool.width / 2} y={-tool.height / 2} width={tool.width} height={tool.height} rx={radius} ry={radius} {...props} />;
      case ToolShape.Special:
        if (tool.customPath) {
            // customPath is typically normalized from 0,0 to W,H. 
            // We translate it to center it at 0,0.
            return (
                <path 
                    d={tool.customPath} 
                    transform={`translate(${-tool.width / 2}, ${-tool.height / 2})`} 
                    {...props} 
                />
            );
        }
        // Fallback for missing custom path
        const pathNominalWidth = 20;
        const pathNominalHeight = 18;
        const scale = Math.min(tool.width / pathNominalWidth, tool.height / pathNominalHeight) * 0.9;
        const transform = `scale(${scale}) translate(-10, -9)`;
        return <path 
                 d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" 
                 transform={transform} 
                 stroke="#c084fc" 
                 fill="rgba(192, 132, 252, 0.3)" 
                 strokeWidth={1.5 / scale}
                 vectorEffect="non-scaling-stroke"
               />;
      default:
        return null;
    }
};

export const ToolPreview: React.FC<{ tool: Tool, className?: string }> = ({ tool, className }) => {
    const maxDim = Math.max(tool.width, tool.height) * 1.2; // 20% padding
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="100%"
            height="100%"
            viewBox={`${-maxDim/2} ${-maxDim/2} ${maxDim} ${maxDim}`}
            preserveAspectRatio="xMidYMid meet"
            className={className}
        >
           <ToolSvg tool={tool} />
        </svg>
    );
};
