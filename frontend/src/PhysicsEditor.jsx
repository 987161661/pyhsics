import React, { useState, useEffect, useRef } from 'react';
import Matter from 'matter-js';
import { Stage, Layer, Rect, Circle, Ellipse, Line, Group, Transformer, Text, Arrow } from 'react-konva';
import { 
  Play, Pause, RotateCcw, Square, Circle as CircleIcon, MousePointer, 
  Move, Settings, Box, Link, ArrowRight, Triangle, ArrowDown, Minus, 
  ChevronDown, ChevronRight, Hexagon, FastForward, RotateCw, Maximize, 
  Activity, Cone, Grid, Layers, Monitor, Scissors, Save, Upload, Undo2, Redo2, Anchor,
  Tent, Disc, X, Zap, Navigation, TrendingUp, Wind, Gauge, Ruler, Timer, Trash2, Type
} from 'lucide-react';
import { Shape } from 'react-konva';
import PhysicsSceneBuilder from './utils/PhysicsEngine';

// --- UI Components ---

const CollapsibleSection = ({ title, children, defaultOpen = true }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="w-full flex flex-col mb-4 border-b border-gray-100 pb-4 last:border-0">
      <button 
        className="w-full flex items-center justify-between px-2 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="flex items-center gap-2">{title}</span>
        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {isOpen && (
          <div className="grid grid-cols-4 gap-2 w-full mt-2 animate-in fade-in slide-in-from-top-1 duration-200">
            {children}
          </div>
      )}
    </div>
  );
};

const ToolButton = ({ icon, active, onClick, tooltip, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={tooltip}
    className={`relative group flex flex-col items-center justify-center p-2 rounded-xl transition-all duration-200 aspect-square
      ${active 
        ? 'bg-blue-50 text-blue-600 shadow-sm ring-1 ring-blue-200' 
        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
      }
      ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
    `}
  >
    {React.cloneElement(icon, { size: 20, strokeWidth: active ? 2.5 : 2 })}
  </button>
);

const SpringShape = ({ points, stroke, strokeWidth, tension = 0.5 }) => {
  return (
    <Shape
      sceneFunc={(context, shape) => {
        context.beginPath();
        const [x1, y1, x2, y2] = points;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.sqrt(dx*dx + dy*dy);
        const angle = Math.atan2(dy, dx);
        
        context.translate(x1, y1);
        context.rotate(angle);
        
        const coils = 12;
        const width = 10;
        
        context.moveTo(0, 0);
        for (let i = 0; i <= coils; i++) {
            const x = (len * i) / coils;
            const y = i % 2 === 0 ? 0 : (i % 4 === 1 ? -width : width);
            // Smoother sine-like wave or zigzag
            // Let's do zigzag for spring
            context.lineTo(x, (i === 0 || i === coils) ? 0 : (i % 2 === 1 ? -width : width));
        }
        context.lineTo(len, 0);
        
        context.restore(); // This handles un-rotate/un-translate? No, sceneFunc doesn't auto-restore context state changes unless save/restore used.
        // But Konva handles transforms usually. Here we are doing manual transform on context.
        // It's safer to not modify context transform if possible or save/restore.
        // Actually context provided by Konva is already transformed to the Shape's x,y.
        // But we are passing points in world/parent coords.
        // So we should NOT rely on Shape x,y if we draw from 0,0 to len.
        // We should just use absolute points if we didn't translate.
        // But rotating is easier with translate.
        // Let's use simple drawing without rotate.
      }}
      stroke={stroke}
      strokeWidth={strokeWidth}
      hitStrokeWidth={10}
    />
  );
};

// Re-implementing SpringShape to be simpler and safer
const ZigzagLine = ({ points, stroke, strokeWidth, coilCount = 10, amplitude = 8, ...props }) => {
    return (
        <Shape
            {...props}
            sceneFunc={(ctx, shape) => {
                const [x1, y1, x2, y2] = points;
                const dx = x2 - x1;
                const dy = y2 - y1;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                
                const coils = coilCount;
                const amp = amplitude;
                // Ensure reasonable step size
                if (coils <= 0) return;
                
                // Normal vector
                const nx = -dy / dist;
                const ny = dx / dist;
                
                for (let i = 1; i < coils; i++) {
                    const t = i / coils;
                    const x = x1 + dx * t;
                    const y = y1 + dy * t;
                    
                    const offset = (i % 2 === 0 ? 1 : -1) * amp;
                    ctx.lineTo(x + nx * offset, y + ny * offset);
                }
                
                ctx.lineTo(x2, y2);
                ctx.fillStrokeShape(shape);
            }}
            stroke={stroke}
            strokeWidth={strokeWidth}
            hitStrokeWidth={15}
        />
    );
};

const AngleGuide = ({ x, y, angle, radius = 80 }) => {
    // Calculate display angle (normalized -180 to 180)
    let degrees = (angle * 180 / Math.PI) % 360;
    if (degrees > 180) degrees -= 360;
    if (degrees < -180) degrees += 360;

    const displayDegrees = Math.round(Math.abs(degrees));
    const drawAngleRad = degrees * (Math.PI / 180);

    return (
        <Group x={x} y={y}>
            {/* Horizontal Axis - Extended and Red Dotted as requested */}
            <Line points={[-radius*2, 0, radius*2, 0]} stroke="#ef4444" strokeWidth={2} dash={[5, 5]} />
            {/* Vertical Axis - Extended and Red Dotted */}
            <Line points={[0, -radius*2, 0, radius*2]} stroke="#ef4444" strokeWidth={2} dash={[5, 5]} />
            
            {/* Angle Arc - Red Style */}
            <Shape
                sceneFunc={(ctx, shape) => {
                    ctx.beginPath();
                    ctx.moveTo(0,0);
                    // Draw arc. If degrees < 0, use anticlockwise (true) to draw the short way
                    ctx.arc(0, 0, radius * 0.6, 0, drawAngleRad, degrees < 0); 
                    ctx.closePath();
                    ctx.fillStrokeShape(shape);
                }}
                fill="rgba(239, 68, 68, 0.1)"
                stroke="#ef4444"
                strokeWidth={2}
            />
            
            {/* Angle Line - Red */}
            <Line 
                points={[0, 0, radius * Math.cos(drawAngleRad), radius * Math.sin(drawAngleRad)]} 
                stroke="#ef4444" 
                strokeWidth={3} 
            />

            {/* Angle Text Badge - Floating near the arc center */}
            <Group 
                x={radius * 0.8 * Math.cos(drawAngleRad/2)}
                y={radius * 0.8 * Math.sin(drawAngleRad/2)}
            >
                <Text
                    x={10}
                    y={10}
                    text={`${displayDegrees}°`}
                    fontSize={18}
                    fontStyle="bold"
                    fill="#ef4444"
                    stroke="white"
                    strokeWidth={4}
                />
                 <Text
                    x={10}
                    y={10}
                    text={`${displayDegrees}°`}
                    fontSize={18}
                    fontStyle="bold"
                    fill="#ef4444"
                />
            </Group>
        </Group>
    );
};

const ReferenceAxis = ({ viewMode }) => {
    return (
        <div className="absolute bottom-6 left-6 pointer-events-none z-50 bg-white/80 backdrop-blur p-2 rounded-lg border border-gray-200 shadow-lg">
            <svg width="60" height="60" viewBox="0 0 60 60">
                <defs>
                    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                        <polygon points="0 0, 10 3.5, 0 7" fill="#4b5563" />
                    </marker>
                </defs>
                {/* Y Axis (Up) or Z Axis (Down in Top View?) 
                    In computer graphics, Y is down. In physics usually Y is up.
                    But our editor has Y down (Canvas coords).
                    PhysicsEngine has gravity Y positive (down).
                    So let's draw axes as they appear on screen.
                */}
                <line x1="10" y1="50" x2="10" y2="10" stroke="#ef4444" strokeWidth="2" markerEnd="url(#arrowhead)" />
                <line x1="10" y1="50" x2="50" y2="50" stroke="#3b82f6" strokeWidth="2" markerEnd="url(#arrowhead)" />
                
                <text x="52" y="54" fontSize="10" fontWeight="bold" fill="#3b82f6">X</text>
                <text x="6" y="8" fontSize="10" fontWeight="bold" fill="#ef4444">
                    {viewMode === 'side' ? 'Y' : 'Z'}
                </text>
            </svg>
            <div className="text-[10px] text-gray-500 font-mono mt-1 text-center">
                {viewMode === 'side' ? '侧视图' : '俯视图'}
            </div>
        </div>
    );
};

const SimpleLineChart = ({ data, dataKeys, colors, width, height, yLabel }) => {
    // If no data, we still render grid with default range
    const isEmpty = !data || data.length === 0;
    
    const padding = { top: 20, right: 20, bottom: 20, left: 40 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    // Find min/max
    let minVal = 0, maxVal = 1;
    let tMin = 0, tMax = 10;

    if (!isEmpty) {
        const allValues = dataKeys.flatMap(key => data.map(d => d[key]));
        const validValues = allValues.filter(v => v !== undefined && v !== null && !isNaN(v));
        
        if (validValues.length > 0) {
            minVal = Math.min(...validValues);
            maxVal = Math.max(...validValues);
        }
        
        const range = maxVal - minVal;
        if (range === 0) {
            minVal -= 1;
            maxVal += 1;
        } else {
            minVal -= range * 0.1;
            maxVal += range * 0.1;
        }

        tMin = data[0].t;
        tMax = data[data.length - 1].t;
    }
    
    const tRange = tMax - tMin || 1;

    const getX = (t) => padding.left + ((t - tMin) / tRange) * chartW;
    const getY = (val) => {
        if (val === undefined || val === null || isNaN(val)) return padding.top + chartH; 
        return padding.top + chartH - ((val - minVal) / (maxVal - minVal)) * chartH;
    };

    return (
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
            {/* Grid */}
            <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="#e5e7eb" strokeWidth="1" />
            <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} stroke="#e5e7eb" strokeWidth="1" />
            
            {/* Zero Line if visible */}
            {minVal < 0 && maxVal > 0 && (
                <line 
                    x1={padding.left} 
                    y1={getY(0)} 
                    x2={width - padding.right} 
                    y2={getY(0)} 
                    stroke="#d1d5db" 
                    strokeDasharray="4 4" 
                />
            )}

            {/* Paths */}
            {!isEmpty && dataKeys.map((key, i) => {
                const points = data.map(d => {
                    const val = d[key];
                    if (val === undefined || val === null || isNaN(val)) return null;
                    return `${getX(d.t)},${getY(val)}`;
                }).filter(p => p).join(' ');
                
                if (!points) return null;

                return (
                    <polyline 
                        key={key} 
                        points={points} 
                        fill="none" 
                        stroke={colors[key] || '#000'} 
                        strokeWidth="2" 
                        strokeLinejoin="round"
                    />
                );
            })}

            {/* Axis Labels */}
            <text x={width / 2} y={height - 5} textAnchor="middle" fontSize="10" fill="#6b7280">Time (s)</text>
            <text x={10} y={height / 2} textAnchor="middle" fontSize="10" fill="#6b7280" transform={`rotate(-90, 10, ${height/2})`}>{yLabel || 'Value'}</text>
            
            {/* Min/Max Labels */}
            <text x={padding.left - 5} y={padding.top + 5} textAnchor="end" fontSize="10" fill="#6b7280">{maxVal.toFixed(1)}</text>
            <text x={padding.left - 5} y={height - padding.bottom} textAnchor="end" fontSize="10" fill="#6b7280">{minVal.toFixed(1)}</text>
            
            {isEmpty && (
                <text x={width/2} y={height/2} textAnchor="middle" fontSize="12" fill="#9ca3af">等待数据...</text>
            )}
        </svg>
    );
};

const GraphPanel = ({ data, onClose, objectNames }) => {
    const [activeAxis, setActiveAxis] = useState('y'); // x, y, z
    const [activeProperty, setActiveProperty] = useState('pos'); // pos, vel, acc

    // Filter and Prepare data for chart
    // Data structure: [{ t, bodies: { id: { x, ... } } }]
    // Need to flatten for chart: [{ t, id1: val, id2: val }]
    
    const flattenData = data.map(frame => {
        const point = { t: frame.t };
        if (frame.bodies) {
            Object.entries(frame.bodies).forEach(([id, bodyData]) => {
                let val = 0;
                if (activeProperty === 'pos') val = bodyData[activeAxis];
                else if (activeProperty === 'vel') val = bodyData[`v${activeAxis}`];
                else if (activeProperty === 'acc') val = bodyData[`a${activeAxis}`];
                point[id] = val;
            });
        }
        return point;
    });

    // Get all unique object IDs present in the last frame (or all frames?)
    // Better to use objectNames keys which represents current scene objects
    const objectIds = Object.keys(objectNames || {});
    
    // Generate colors for objects
    const colors = {};
    const palette = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'];
    objectIds.forEach((id, i) => {
        colors[id] = palette[i % palette.length];
    });

    const axisLabel = activeAxis.toUpperCase();
    const propLabel = activeProperty === 'pos' ? '位移' : activeProperty === 'vel' ? '速度' : '加速度';
    const yLabel = `${axisLabel} ${propLabel}`;

    return (
        <div className="w-full mt-4 bg-white/95 backdrop-blur-md rounded-2xl shadow-sm border border-gray-200 flex flex-col animate-in fade-in slide-in-from-right-4 overflow-hidden">
            <div className="flex items-center justify-between p-3 border-b border-gray-100 bg-gray-50/50">
                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                    <Activity size={14} className="text-blue-600" /> 运动图表
                </h3>
                
                {/* Axis Selector */}
                <div className="flex bg-gray-200/50 rounded-lg p-0.5">
                    {['x', 'y', 'z'].map(axis => (
                        <button
                            key={axis}
                            onClick={() => setActiveAxis(axis)}
                            className={`px-3 py-0.5 text-[10px] font-bold rounded-md transition-all ${activeAxis === axis ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            {axis.toUpperCase()}
                        </button>
                    ))}
                </div>

                <button onClick={onClose} className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1 rounded-lg transition-all">
                    <X size={14} />
                </button>
            </div>
            
            <div className="flex p-1 bg-gray-100/50 m-2 rounded-lg">
                {['pos', 'vel', 'acc'].map(prop => (
                    <button
                        key={prop}
                        onClick={() => setActiveProperty(prop)}
                        className={`flex-1 py-1 text-xs font-bold rounded-md transition-all ${activeProperty === prop ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        {prop === 'pos' ? '位移' : prop === 'vel' ? '速度' : '加速度'}
                    </button>
                ))}
            </div>

            <div className="h-40 w-full p-2 relative flex">
                <div className="flex-1 h-full">
                    <SimpleLineChart 
                        data={flattenData} 
                        dataKeys={objectIds} 
                        colors={colors} 
                        width={300} 
                        height={160}
                        yLabel={yLabel}
                    />
                </div>
                {/* Legend */}
                <div className="w-20 flex flex-col gap-1 overflow-y-auto max-h-full pl-2 border-l border-gray-100">
                    {objectIds.map((id) => (
                        <div key={id} className="flex items-center gap-1 shrink-0">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: colors[id] }} />
                            <span className="text-[10px] text-gray-600 truncate" title={objectNames[id]}>{objectNames[id]}</span>
                        </div>
                    ))}
                    {objectIds.length === 0 && <span className="text-[10px] text-gray-400">无对象</span>}
                </div>
            </div>
        </div>
    );
};

// --- Main Editor ---

const PhysicsEditor = () => {
  const builderRef = useRef(null);
  if (!builderRef.current) {
    builderRef.current = new PhysicsSceneBuilder('physics-canvas', window.innerWidth - 384, window.innerHeight); // Adjusted width
  }
  const builder = builderRef.current;
  const engine = builder.getEngine();

  // State
  const [isRunning, setIsRunning] = useState(false);
  const [objects, setObjects] = useState([]); 
  const [constraints, setConstraints] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [tool, setTool] = useState('select'); 
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [version, setVersion] = useState(0);
  const [viewMode, setViewMode] = useState('side'); 
  const [showGraphPanel, setShowGraphPanel] = useState(false);
  const [graphData, setGraphData] = useState([]);
  const graphDataRef = useRef([]);
  const lastGraphUpdateRef = useRef(0);
  const prevVelocityRef = useRef({ x: 0, y: 0 });
  const [defaultPlacementZ, setDefaultPlacementZ] = useState(0);
  const [defaultPlacementY, setDefaultPlacementY] = useState(0);
  const [isAdjustingGlobal, setIsAdjustingGlobal] = useState(false);
  const [connectionStart, setConnectionStart] = useState(null); 
  const [velocityStart, setVelocityStart] = useState(null);
  const [cutStart, setCutStart] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [snapLines, setSnapLines] = useState([]);
  const stageRef = useRef(null);
  const renderRef = useRef(null);
  const dragRef = useRef({ activeId: null, startX: 0, startY: 0, startAngle: 0, startWidth: 0, startHeight: 0, startRadius: 0 });
  const trRef = useRef(null);
  const shapeRefs = useRef({});

  // New State for Optimization
  const [showVectors, setShowVectors] = useState(false);
  const [showTrajectory, setShowTrajectory] = useState(false);
  const [globalSettings, setGlobalSettings] = useState({
      gravity: { x: 0, y: 1 },
      airResistance: 0.0, // Global frictionAir is hard to set directly on engine, usually per body. 
                          // But we can simulate it or set defaults for new bodies.
                          // Actually Matter.js world has gravity.
      timeScale: 1
  });
  const trajectoryRef = useRef({}); // id -> [{x,y}, ...]
  const [telemetry, setTelemetry] = useState({}); // id -> { velocity, force, ... }
  
  // Measurement Tools State
  const [rulers, setRulers] = useState([]); // Array of {x1, y1, x2, y2, id}
  const [rulerStart, setRulerStart] = useState(null);
  const [showStopwatch, setShowStopwatch] = useState(false);
  const [interactionConstraintId, setInteractionConstraintId] = useState(null);

  // Sync Global Settings
  useEffect(() => {
      builder.setEngineProperties(globalSettings);
  }, [globalSettings, builder]);

  // Transformer Selection Logic
  useEffect(() => {
    if (selectedId && trRef.current && shapeRefs.current[selectedId]) {
      trRef.current.nodes([shapeRefs.current[selectedId]]);
      trRef.current.getLayer().batchDraw();
    } else if (trRef.current) {
      trRef.current.nodes([]);
      trRef.current.getLayer().batchDraw();
    }
  }, [selectedId, objects]);


  const GRID_SIZE = 50;
  const snap = (val) => snapToGrid ? Math.round(val / GRID_SIZE) * GRID_SIZE : val;

  const checkOverlap = (bodyId) => {
      const body = builder.entities[bodyId];
      if (!body) return false;
      
      const bodies = Matter.Composite.allBodies(engine.world);
      for (const other of bodies) {
          if (other === body) continue;
          
          // Check collision with tolerance
          const collision = Matter.SAT.collides(body, other);
          if (collision && collision.collided) {
               // Allow very slight overlap (touching) to enable stacking
               const overlap = collision.overlap || 0;
               if (overlap < 0.5) continue;
               
               return true;
          }
      }
      return false;
  };

  // Snapping Logic
  const getSnapPosition = (activeId, x, y, activeW = null, activeH = null) => {
      // Resolve dimensions
      let w = activeW;
      let h = activeH;

      if (activeId && (!w || !h)) {
          const activeData = builder.sceneData[activeId];
          if (!activeData) return { x, y, lines: [] };
          w = activeData.width || (activeData.radius * 2) || 50;
          h = activeData.height || (activeData.radius * 2) || 50;
      }

      // If still no dimensions (e.g. creating new object without passing dims), default to 50
      if (!w) w = 50;
      if (!h) h = 50;
      
      const left = x - w/2;
      const right = x + w/2;
      const top = y - h/2;
      const bottom = y + h/2;

      let snappedX = x;
      let snappedY = y;
      const lines = [];
      const threshold = 10;

      // Iterate through other objects
      Object.keys(builder.sceneData).forEach(id => {
          if (id === activeId) return;
          const target = builder.sceneData[id];
          // Get target view coordinates
          let targetX = target.x;
          let targetY = viewMode === 'side' ? target.y : target.z;
          
          let tw = target.width || (target.radius * 2) || 50;
          let th = target.height || (target.radius * 2) || 50;
          
          const tLeft = targetX - tw/2;
          const tRight = targetX + tw/2;
          const tTop = targetY - th/2;
          const tBottom = targetY + th/2;

          // X Snapping
          // Snap Left to Right
          if (Math.abs(left - tRight) < threshold) {
              snappedX = tRight + w/2;
              lines.push([tRight, tTop, tRight, tBottom]); // Visual guide
          }
          // Snap Right to Left
          if (Math.abs(right - tLeft) < threshold) {
              snappedX = tLeft - w/2;
              lines.push([tLeft, tTop, tLeft, tBottom]);
          }
          // Snap Center to Center
          if (Math.abs(x - targetX) < threshold) {
              snappedX = targetX;
              lines.push([targetX, tTop, targetX, tBottom]);
          }

          // Y Snapping
          // Snap Top to Bottom
          if (Math.abs(top - tBottom) < threshold) {
              snappedY = tBottom + h/2;
              lines.push([tLeft, tBottom, tRight, tBottom]);
          }
          // Snap Bottom to Top
          if (Math.abs(bottom - tTop) < threshold) {
              snappedY = tTop - h/2;
              lines.push([tLeft, tTop, tRight, tTop]);
          }
           // Snap Center to Center
           if (Math.abs(y - targetY) < threshold) {
              snappedY = targetY;
              lines.push([tLeft, targetY, tRight, targetY]);
          }
      });

      return { x: snappedX, y: snappedY, lines };
  };

  // History Management
  const pushHistory = () => {
    const state = builder.getState();
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(state);
    if (newHistory.length > 20) newHistory.shift(); // Limit history size
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
        const prevIndex = historyIndex - 1;
        const state = history[prevIndex];
        builder.restoreState(state);
        setHistoryIndex(prevIndex);
        setVersion(v => v + 1);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
        const nextIndex = historyIndex + 1;
        const state = history[nextIndex];
        builder.restoreState(state);
        setHistoryIndex(nextIndex);
        setVersion(v => v + 1);
    }
  };

  const handleSave = () => {
      const state = builder.getState();
      const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `physics-scene-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
  };

  const handleLoad = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
          try {
              const state = JSON.parse(event.target.result);
              builder.restoreState(state);
              pushHistory(); // Add loaded state to history
              setVersion(v => v + 1);
          } catch (err) {
              alert('Failed to load file');
          }
      };
      reader.readAsText(file);
  };

  // View Mode Sync
  useEffect(() => {
    builder.setViewMode(viewMode);
    setVersion(v => v + 1);
  }, [viewMode, builder]);

  // Init History
  useEffect(() => {
      if (history.length === 0) pushHistory();
  }, []);

  // Deletion
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        builder.removeObject(selectedId);
        setSelectedId(null);
        setVersion(v => v + 1);
        pushHistory();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
          e.preventDefault();
          if (e.shiftKey) handleRedo();
          else handleUndo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
          e.preventDefault();
          handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, builder, history, historyIndex]);

  // Reset graph on selection change
   useEffect(() => {
       // Initialize with current state if object exists
       if (selectedId) {
           const bodies = Matter.Composite.allBodies(engine.world);
           // Safe check for plugin existence to avoid crashes
           const body = bodies.find(b => b.plugin && b.plugin.userLabel === selectedId);
           const sceneObj = builder.sceneData[selectedId];
           
           if (body && sceneObj) {
                // Initial point
                const initialData = {
                    t: engine.timing.timestamp / 1000,
                    x: body.position.x,
                    y: viewMode === 'side' ? body.position.y : sceneObj.y,
                    z: viewMode === 'top' ? body.position.y : sceneObj.z,
                    vx: 0, vy: 0, vz: 0,
                    ax: 0, ay: 0, az: 0
                };
                graphDataRef.current = [initialData];
                setGraphData([initialData]);
                prevVelocityRef.current = { x: 0, y: 0, z: 0 };
           } else {
               // If not a body (e.g. constraint) or not found, clear graph
               setGraphData([]);
               graphDataRef.current = [];
           }
       } else {
           setGraphData([]);
           graphDataRef.current = [];
       }
   }, [selectedId, viewMode, version]);

  // Loop
  useEffect(() => {
    let lastTime = performance.now();
    let accumulator = 0;
    const dt = 1000 / 60;

    // Initialize prev velocities if empty
    if (Object.keys(prevVelocityRef.current).length === 0 && prevVelocityRef.current.x === undefined) {
         prevVelocityRef.current = {};
    }

    const runner = () => {
      const now = performance.now();
      let frameTime = now - lastTime;
      lastTime = now;

      // Cap frame time to prevent spiral of death
      if (frameTime > 100) frameTime = 100;

      if (isRunning) {
        accumulator += frameTime;
        while (accumulator >= dt) {
            Matter.Engine.update(engine, dt);
            accumulator -= dt;
        }
        
        // Update Graph Data for ALL tracked objects
        const bodies = Matter.Composite.allBodies(engine.world).filter(b => b.plugin && b.plugin.userLabel && !b.isStatic);
        
        // Collect Telemetry
        const currentTelemetry = builder.getTelemetry();
        if (showVectors) {
             setTelemetry(currentTelemetry);
        }

        // Update Trajectory
        if (showTrajectory) {
            Object.entries(currentTelemetry).forEach(([id, data]) => {
                if (!trajectoryRef.current[id]) trajectoryRef.current[id] = [];
                const trace = trajectoryRef.current[id];
                const pos = viewMode === 'side' ? { x: data.position.x, y: data.position.y } : { x: data.position.x, y: data.position.y }; // Use raw world pos, map later
                
                // Add point if moved enough
                const last = trace.length > 0 ? trace[trace.length - 1] : null;
                if (!last || Math.pow(last.x - pos.x, 2) + Math.pow(last.y - pos.y, 2) > 4) {
                    trace.push(pos);
                    if (trace.length > 50) trace.shift();
                }
            });
        }

        if (bodies.length > 0) {
            const nowTimestamp = engine.timing.timestamp;
            const t = nowTimestamp / 1000;
            const bodiesData = {};

            bodies.forEach(body => {
                const id = body.plugin.userLabel;
                const sceneObj = builder.sceneData[id];
                if (!sceneObj) return;

                const vx = body.velocity.x;
                let vy = 0, vz = 0;
                
                if (viewMode === 'side') {
                    vy = body.velocity.y;
                } else {
                    vz = body.velocity.y; // In top view, physics Y is World Z
                }

                // Initialize prev velocity for this body if missing
                if (!prevVelocityRef.current[id]) {
                    prevVelocityRef.current[id] = { x: vx, y: vy, z: vz };
                }
                
                const prev = prevVelocityRef.current[id];
                const ax = (vx - prev.x) * 60; 
                const ay = (vy - prev.y) * 60;
                const az = (vz - prev.z) * 60;
                
                prevVelocityRef.current[id] = { x: vx, y: vy, z: vz };

                bodiesData[id] = {
                    x: body.position.x,
                    y: viewMode === 'side' ? body.position.y : sceneObj.y,
                    z: viewMode === 'top' ? body.position.y : sceneObj.z,
                    vx, vy, vz,
                    ax, ay, az
                };
            });

            const newData = {
                t,
                bodies: bodiesData
            };
            
            graphDataRef.current.push(newData);
            if (graphDataRef.current.length > 1000) graphDataRef.current.shift();

            // Throttle UI updates using real time
            if (now - lastGraphUpdateRef.current > 100) {
                setGraphData([...graphDataRef.current]);
                lastGraphUpdateRef.current = now;
            }
        }
      }
      
      const newObjects = Matter.Composite.allBodies(engine.world).map(body => ({
        id: body.id,
        x: body.position.x,
        y: body.position.y,
        angle: body.angle,
        type: body.label, 
        isStatic: body.isStatic,
        width: body.width,
        height: body.height,
        radius: body.radius,
        vertices: body.vertices.map(v => ({x: v.x - body.position.x, y: v.y - body.position.y})),
        visualWidth: body.visualWidth,
        visualHeight: body.visualHeight,
        visualRadius: body.visualRadius,
        visualVertices: body.visualVertices ? body.visualVertices.map(v => ({x: v.x - body.position.x, y: v.y - body.position.y})) : undefined,
        isPointMass: body.isPointMass,
        plugin: body.plugin,
        ...body.render 
      }));
      setObjects(newObjects);

      const newConstraints = [];
      Matter.Composite.allConstraints(engine.world).forEach(cons => {
        const posA = cons.bodyA ? Matter.Vector.add(cons.bodyA.position, cons.pointA) : cons.pointA;
        const posB = cons.bodyB ? Matter.Vector.add(cons.bodyB.position, cons.pointB) : cons.pointB;
        newConstraints.push({ id: cons.id, type: 'line', points: [posA.x, posA.y, posB.x, posB.y], color: '#9ca3af' });
      });

      if (builder.customConstraints) {
        builder.customConstraints.forEach(cons => {
            if (cons.type === 'ideal_rope') {
                const posA = cons.bodyA ? Matter.Vector.add(cons.bodyA.position, cons.pointA) : cons.pointA;
                const posB = cons.bodyB ? Matter.Vector.add(cons.bodyB.position, cons.pointB) : cons.pointB;
                newConstraints.push({ id: cons.id, type: 'rope', points: [posA.x, posA.y, posB.x, posB.y], color: '#e67e22' });
            } else if (cons.type === 'spring') {
                const posA = cons.bodyA ? Matter.Vector.add(cons.bodyA.position, cons.pointA) : cons.pointA;
                const posB = cons.bodyB ? Matter.Vector.add(cons.bodyB.position, cons.pointB) : cons.pointB;
                newConstraints.push({ id: cons.id, type: 'spring', points: [posA.x, posA.y, posB.x, posB.y], color: '#27ae60', dash: [10, 5] });
            } else if (cons.type === 'pulley') {
                const posA = cons.bodyA ? Matter.Vector.add(cons.bodyA.position, cons.pointA) : cons.pointA;
                const posB = cons.bodyB ? Matter.Vector.add(cons.bodyB.position, cons.pointB) : cons.pointB;
                const pC = cons.pointC;
                const pD = cons.pointD;
                newConstraints.push({ 
                    id: cons.id, 
                    type: 'pulley', 
                    points: [posA.x, posA.y, pC.x, pC.y, pD.x, pD.y, posB.x, posB.y], 
                    color: '#8e44ad' 
                });
            } else if (cons.type === 'friction') {
                const bodyA = builder.entities[cons.bodyAId];
                const bodyB = builder.entities[cons.bodyBId];
                if (bodyA && bodyB) {
                    newConstraints.push({ 
                        id: cons.id, 
                        type: 'friction', 
                        points: [bodyA.position.x, bodyA.position.y, bodyB.position.x, bodyB.position.y], 
                        color: '#f1c40f', 
                        dash: [5, 5] 
                    });
                }
            } else if (cons.type === 'force') {
                const bodyA = builder.entities[cons.bodyAId];
                if (bodyA) {
                    // Force vector is usually small (e.g. 0.05). Scale up for visualization.
                    const visScale = 5000;
                    const endX = bodyA.position.x + cons.vector.x * visScale;
                    const endY = bodyA.position.y + cons.vector.y * visScale;
                    newConstraints.push({
                        id: cons.id,
                        type: 'force',
                        points: [bodyA.position.x, bodyA.position.y, endX, endY],
                        color: cons.color || '#e74c3c'
                    });
                }
            }
        });
      }
      setConstraints(newConstraints);

      renderRef.current = requestAnimationFrame(runner);
    };
    runner();
    return () => cancelAnimationFrame(renderRef.current);
  }, [isRunning, engine, builder, version]);

  // Mouse Handlers
  const handleStageMouseDown = (e) => {
      const stage = e.target.getStage();
      const pointer = stage.getRelativePointerPosition();
      
      if (pointer && tool === 'ruler') {
          setRulerStart(pointer);
      }

      if (pointer && tool === 'cut') {
          setCutStart(pointer);
      }
      // Also handle deselection if clicking empty space
      if (e.target === stage && tool === 'select') {
          setSelectedId(null);
      }
  };

  const handleWheel = (e) => {
    // Zoom logic
    e.evt.preventDefault();
    const stage = stageRef.current;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();

    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    // Zoom speed
    const scaleBy = 1.1;
    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;

    // Limit zoom range
    if (newScale < 0.1 || newScale > 10) return;

    stage.scale({ x: newScale, y: newScale });

    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };
    stage.position(newPos);
  };

  const handleStageMouseMove = (e) => {
      const stage = e.target.getStage();
      const pointer = stage.getRelativePointerPosition();
      if (pointer) {
          setMousePos(pointer);
          
          if (tool === 'velocity' && velocityStart) {
              setVelocityStart(prev => ({ ...prev, currentX: pointer.x, currentY: pointer.y }));
          }

          if (interactionConstraintId) {
               // Update interaction constraint target position
               // Note: Interaction constraint works in world coordinates (same as view for 2D)
               builder.updateInteractionConstraint(interactionConstraintId, pointer);
          }

          if (dragRef.current.activeId) {
              const { activeId, startX, startY, startAngle, startWidth, startHeight, startRadius } = dragRef.current;
              const dx = pointer.x - startX;
              const dy = pointer.y - startY; // Need dy for movement logic if we change to relative

              if (tool === 'select') { // Assuming dragging logic is implicit for select tool if not strictly separated
                  // Actually dragRef is set in handleObjectMouseDown, and Stage draggable is false if select.
                  // But we use Konva draggable for objects usually? 
                  // Ah, looking at the code, objects have `draggable={tool === 'select'}`.
                  // So Konva handles the drag visually.
                  // But we might want to override position if we want to show snapping *during* drag.
                  // Konva's onDragMove event is better for this.
              }

              if (tool === 'rotate') {
                  const angleChange = dx * (Math.PI / 180);
                  let newAngle = startAngle + angleChange;

                  // Snap to special angles
                  const snapAngles = [0, 30, 37, 45, 53, 60, 90, 120, 127, 135, 143, 150, 180, 210, 217, 225, 233, 240, 270, 300, 307, 315, 323, 330];
                  const snapThreshold = 5; // degrees

                  let degree = newAngle * (180 / Math.PI);
                  // Normalize to 0-360
                  let normDeg = degree % 360;
                  if (normDeg < 0) normDeg += 360;

                  let closest = null;
                  let minDiff = Infinity;

                  for (let target of snapAngles) {
                      let diff = Math.abs(normDeg - target);
                      // Handle wrapping
                      if (Math.abs(normDeg - (target + 360)) < diff) diff = Math.abs(normDeg - (target + 360));
                      if (Math.abs(normDeg - (target - 360)) < diff) diff = Math.abs(normDeg - (target - 360));

                      if (diff < snapThreshold && diff < minDiff) {
                          minDiff = diff;
                          closest = target;
                      }
                  }

                  if (closest !== null) {
                      // Adjust newAngle to align with closest
                      const k = Math.round((degree - closest) / 360);
                      newAngle = (closest + k * 360) * (Math.PI / 180);
                  }

                  const oldAngle = builder.entities[activeId] ? builder.entities[activeId].angle : 0;
                  builder.updateObject(activeId, { angle: newAngle });
                  
                  if (checkOverlap(activeId)) {
                      builder.updateObject(activeId, { angle: oldAngle });
                  }

              } else if (tool === 'scale') {
                  const scaleFactor = Math.max(0.1, 1 + (dx / 100));
                  const data = builder.sceneData[activeId];
                  const oldW = data.width;
                  const oldH = data.height;
                  const oldR = data.radius;

                  if (startRadius) {
                      builder.updateObject(activeId, { radius: startRadius * scaleFactor });
                  } else {
                      builder.updateObject(activeId, { width: startWidth * scaleFactor, height: startHeight * scaleFactor });
                  }

                  if (checkOverlap(activeId)) {
                       builder.updateObject(activeId, { width: oldW, height: oldH, radius: oldR });
                  }
              }
              setVersion(v => v + 1);
          }
      }
  };

  const handleStageMouseUp = () => {
      if (interactionConstraintId) {
          builder.removeInteractionConstraint(interactionConstraintId);
          setInteractionConstraintId(null);
      }

      dragRef.current.activeId = null;
      setVersion(v => v + 1); // Force re-render to hide guides
      
      if (tool === 'ruler' && rulerStart) {
          const stage = stageRef.current;
          const pointer = stage.getRelativePointerPosition();
          if (pointer) {
             const newRuler = {
                 id: Date.now().toString(),
                 x1: rulerStart.x,
                 y1: rulerStart.y,
                 x2: pointer.x,
                 y2: pointer.y
             };
             setRulers(prev => [...prev, newRuler]);
          }
          setRulerStart(null);
      }

      if (tool === 'cut' && cutStart) {
          const stage = stageRef.current;
          const pointer = stage.getRelativePointerPosition();
          if (pointer) {
             // Convert view coordinates to world coordinates for cutting
             // But physics engine uses view-dependent logic for 'cutObject' usually?
             // cutObject(p1, p2) expects coordinates that match body positions.
             // PhysicsEngine bodies are positioned according to view mode (synced).
             // So passing stage pointer directly (which matches rendered body positions) is correct.
             builder.cutObject(cutStart, pointer);
             setVersion(v => v + 1);
             pushHistory();
          }
          setCutStart(null);
      }

      if (tool === 'velocity' && velocityStart) {
          const { startX, startY, currentX, currentY, id } = velocityStart;
          // Drag direction determines velocity direction
          const dx = currentX - startX;
          const dy = currentY - startY;
          
          // Apply velocity
          // Scale: 100px = 10 m/s => 0.1
          const scale = 0.1;
          const vx = dx * scale;
          const vy = dy * scale;
          
          const body = builder.entities[id];
          if (body) {
              builder.updateObject(id, { velocity: { x: vx, y: vy } });
              setVersion(v => v + 1);
              pushHistory();
          }
          setVelocityStart(null);
      }
  };

  const handleObjectMouseDown = (e, objId) => {
      if (tool === 'select' && isRunning) {
          e.cancelBubble = true;
          const stage = e.target.getStage();
          const pointer = stage.getRelativePointerPosition();
          if (pointer) {
              const cId = builder.createInteractionConstraint(objId, pointer);
              setInteractionConstraintId(cId);
          }
          return;
      }

      if (tool === 'cut') {
          // Start cutting
          const stage = e.target.getStage();
          const pointer = stage.getRelativePointerPosition();
          if (pointer) {
              setCutStart(pointer);
              e.cancelBubble = true; // Don't trigger stage click? 
              // Actually we want stage to handle mouse down for cut too.
          }
          return;
      }

      if (tool === 'velocity') {
          e.cancelBubble = true;
          const stage = e.target.getStage();
          const data = builder.sceneData[objId];
          if (data) {
              // Use object center as start
              const startX = data.x;
              const startY = data.y;
              setVelocityStart({
                  id: objId,
                  startX: startX,
                  startY: startY,
                  currentX: startX,
                  currentY: startY
              });
          }
          return;
      }
      if (tool === 'rotate' || tool === 'scale') {
          e.cancelBubble = true;
          const stage = e.target.getStage();
          const pointer = stage.getRelativePointerPosition();
          const data = builder.sceneData[objId];
          if (data && pointer) {
            dragRef.current = {
                activeId: objId,
                startX: pointer.x,
                startY: pointer.y,
                startAngle: data.angle || 0,
                startWidth: data.width,
                startHeight: data.height,
                startRadius: data.radius
            };
            setVersion(v => v + 1); // Force re-render to show guides immediately
          }
      }
  };

  const createConstraint = (start, end) => {
      const id = Date.now().toString();
      const startX = start.x;
      const startY = start.y;
      const startZ = start.z;
      const endX = end.x;
      const endY = end.y;
      const endZ = end.z;
      
      const dist = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2) + Math.pow(endZ - startZ, 2));

      let bodyAId = null, pointA = null;
      if (start.type === 'body') {
          bodyAId = start.id;
          pointA = { x: 0, y: 0 }; 
      } else {
          pointA = viewMode === 'side' ? { x: startX, y: startY } : { x: startX, y: startZ };
      }

      let bodyBId = null, pointB = null;
      if (end.type === 'body') {
          bodyBId = end.id;
          pointB = { x: 0, y: 0 };
      } else {
          pointB = viewMode === 'side' ? { x: endX, y: endY } : { x: endX, y: endZ };
      }

      if (tool === 'rope') {
          builder.createIdealRope(id, { bodyAId, bodyBId, pointA, pointB, length: dist || 100 });
      } else if (tool === 'spring') {
          builder.createSpring(id, { bodyAId, bodyBId, pointA, pointB, length: dist || 100, stiffness: 0.01, damping: 0.1 });
      } else if (tool === 'pulley') {
           const pC = { x: startX, y: startY - 150, z: startZ };
           const pD = { x: endX, y: endY - 150, z: endZ };
           
           builder.createPulley(id, { 
              bodyAId, bodyBId, 
              pointA, pointB, 
              pointC: pC, pointD: pD,
              length: dist + 300 // Extra length for pulley strings
           });
      } else if (tool === 'friction') {
           builder.createFrictionConstraint(id, { bodyAId, bodyBId });
      } else if (tool === 'force') {
           if (bodyAId) {
                // Vector from Body Center to End Point
                // Default scale: 0.0002 per pixel (adjust as needed)
                const vec = { x: endX - startX, y: endY - startY };
                const scale = 0.0002;
                const forceVec = { x: vec.x * scale, y: vec.y * scale };
                builder.createForce(id, { bodyId: bodyAId, vector: forceVec });
           }
      }
  };

  const handleObjectClick = (e, objId) => {
      if (['rope', 'spring', 'pulley', 'friction', 'force'].includes(tool)) {
          e.cancelBubble = true;
          const stage = e.target.getStage();
          const data = builder.sceneData[objId];
          
          // Use true world coordinates
          const point = { 
              type: 'body', 
              id: objId, 
              x: data.x, 
              y: data.y,
              z: data.z
          };
          
          if (!connectionStart) {
              const stagePointer = stage.getRelativePointerPosition();
              setConnectionStart({ ...point, viewX: stagePointer.x, viewY: stagePointer.y });
          } else {
              // If force tool, second click on body means vector ends at body center
              createConstraint(connectionStart, point);
              setConnectionStart(null);
              setVersion(v => v + 1);
              pushHistory();
          }
      }
  };

  const handleStageClick = (e) => {
    // Handle Force Tool End Click (on empty space)
    if (tool === 'force' && connectionStart) {
        const stage = e.target.getStage();
        const pointer = stage.getRelativePointerPosition();
        if (pointer) {
           createConstraint(connectionStart, { x: pointer.x, y: pointer.y });
           setConnectionStart(null);
           setVersion(v => v + 1);
           pushHistory();
        }
        return;
    }

    const isCreationTool = ['rect', 'circle', 'ground', 'wall', 'ramp', 'polygon', 'conveyor', 'rope', 'spring', 'cone', 'trapezoid', 'capsule'].includes(tool);
    if (!isCreationTool && e.target !== e.target.getStage()) return;  

    const stage = e.target.getStage();
    const pointer = stage.getRelativePointerPosition();
    if (!pointer) return;

    const id = Date.now().toString();

    // Determine default dimensions and type for snapping/overlap check
    let defaultW = 50;
    let defaultH = 50;
    let type = 'Rectangle';

    if (tool === 'ground') { defaultW = 200; defaultH = 60; type = 'Ground'; }
    else if (tool === 'wall') { defaultW = 20; defaultH = 200; type = 'Wall'; }
    else if (tool === 'ramp') { defaultW = 100; defaultH = 100; type = 'Triangle'; }
    else if (tool === 'conveyor') { defaultW = 150; defaultH = 20; type = 'Conveyor'; }
    else if (tool === 'polygon') { defaultW = 60; defaultH = 60; type = 'Polygon'; }
    else if (tool === 'circle') { defaultW = 50; defaultH = 50; type = 'Circle'; }
    else if (tool === 'cone') { defaultW = 50; defaultH = 50; type = 'Cone'; }
    else if (tool === 'trapezoid') { defaultW = 80; defaultH = 50; type = 'Trapezoid'; }
    else if (tool === 'capsule') { defaultW = 50; defaultH = 100; type = 'Capsule'; }

    // Attempt object snap first
    const snapResult = getSnapPosition(null, pointer.x, pointer.y, defaultW, defaultH);
    
    let x = snapResult.x;
    let y = snapResult.y;

    // If no significant snap happened, check grid snap
    const objectSnapped = (Math.abs(x - pointer.x) > 0.1 || Math.abs(y - pointer.y) > 0.1);
    if (!objectSnapped) {
        x = snap(pointer.x);
        y = snap(pointer.y);
    }
    
    // Check for overlap
    // Note: getSnapPosition returns the snapped CENTER.
    // isRegionFree expects CENTER coordinates and DIMENSIONS.
    // However, if we are snapping to an object edge, isRegionFree might return false if it's too tight?
    // Usually isRegionFree should allow "touching" but not "overlapping".
    // My implementation of isRegionFree uses strict inequalities (<, >), so touching is allowed.
    if (!builder.isRegionFree(x, y, defaultW, defaultH, type)) {
        // Option 1: Prevent creation
        // Option 2: Show warning.
        // User said: "不允许体积重叠创建" (Do not allow creation if volume overlaps)
        // I will flash a warning and return.
        console.warn('Cannot create object: Region overlaps with existing object.');
        // Maybe show a visual indicator? For now, just return.
        // Or maybe try to find a nearby free spot? No, simple rejection is better for now.
        return; 
    }

    // Show snap lines briefly
    if (snapResult.lines.length > 0) {
        setSnapLines(snapResult.lines);
        setTimeout(() => setSnapLines([]), 500);
    }
    
    const mappedDefaultZ = (window.innerHeight / 2) - defaultPlacementZ;
    const mappedDefaultY = (window.innerHeight / 2) - defaultPlacementY;

    let finalX = x, finalY = y, finalZ;
    if (viewMode === 'side') {
        finalZ = mappedDefaultZ;
    } else {
        finalY = mappedDefaultY;
        finalZ = y;
    }

    if (tool === 'rope' || tool === 'spring' || tool === 'pulley' || tool === 'friction') {
        const currentPoint = { type: 'point', x: finalX, y: finalY, z: finalZ, viewX: x, viewY: y };
        
        if (!connectionStart) {
            setConnectionStart(currentPoint);
        } else {
            createConstraint(connectionStart, currentPoint);
            setConnectionStart(null);
            setVersion(v => v + 1);
            pushHistory();
        }
        return;
    }
    
    const defaultDepth = 50;
    let created = false;
    if (tool === 'rect') {
      builder.createBlock(id, { x: finalX, y: finalY, z: finalZ, width: 50, height: 50, depth: defaultDepth, color: '#3b82f6' });
      created = true;
    } else if (tool === 'circle') {
       builder.createBall(id, { x: finalX, y: finalY, z: finalZ, radius: 25, color: '#ef4444' });
       created = true;
    } else if (tool === 'polygon') {
       builder.createPolygon(id, { x: finalX, y: finalY, z: finalZ, sides: 5, radius: 30, color: '#9b59b6' });
       created = true;
    } else if (tool === 'cone') {
       builder.createCone(id, { x: finalX, y: finalY, z: finalZ, radius: 25, height: 50, color: '#f1c40f' });
       created = true;
    } else if (tool === 'ground') {
       // Increase thickness to prevent tunneling
       builder.createBlock(id, { x: finalX, y: finalY, z: finalZ, width: 200, height: 60, depth: 200, isStatic: true, color: '#2c3e50', label: 'Ground' });
       created = true;
    } else if (tool === 'wall') {
       builder.createBlock(id, { x: finalX, y: finalY, z: finalZ, width: 20, height: 200, depth: 200, isStatic: true, color: '#7f8c8d', label: 'Wall' });
       created = true;
    } else if (tool === 'ramp') {
       builder.createIncline(id, { x: finalX, y: finalY, z: finalZ, width: 100, height: 100, depth: 100 });
       created = true;
    } else if (tool === 'conveyor') {
       builder.createConveyorBelt(id, { x: finalX, y: finalY, z: finalZ, width: 150, height: 20, depth: 50, speed: 5 });
       created = true;
    } else if (tool === 'trapezoid') {
       // Create Trapezoid
       // We can use createBlock as base or need a new method. 
       // PhysicsEngine updateObject handles 'Trapezoid' type, but we need createTrapezoid method or pass type manually.
       // Let's assume we can call createBlock but override type, or better add createTrapezoid to builder.
       // For now, I'll use generic _createBodyFromData logic by manually constructing data.
       builder.createObject(id, { type: 'Trapezoid', x: finalX, y: finalY, z: finalZ, width: 80, height: 50, depth: 50, color: '#e67e22' });
       created = true;
    } else if (tool === 'capsule') {
       builder.createObject(id, { type: 'Capsule', x: finalX, y: finalY, z: finalZ, width: 50, height: 100, depth: 50, color: '#1abc9c' });
       created = true;
    } else if (tool === 'text') {
       builder.createText(id, { x: finalX, y: finalY, z: finalZ, text: 'Label' });
       created = true;
    }
    
    if (created) {
        setVersion(v => v + 1);
        pushHistory();
    }
  };

  const handleDragEnd = (e, sceneId) => {
      const body = builder.entities[sceneId];
      
      setSnapLines([]); // Clear snap lines
      if (body) {
          const x = e.target.x(); // Already snapped in onDragMove
          const y = e.target.y();

          // Double check snapping just in case?
          const { x: finalX, y: finalY } = getSnapPosition(sceneId, x, y);

          const originalX = body.position.x;
          const originalY = body.position.y;
          
          // Move body to proposed position in Physics World
          Matter.Body.setPosition(body, { x: finalX, y: finalY });
          
          if (checkOverlap(sceneId)) {
              // Revert to original position
              Matter.Body.setPosition(body, { x: originalX, y: originalY });
              e.target.x(originalX);
              e.target.y(originalY);
              // Show warning
              console.warn("Overlap detected! Reverting position.");
              // Maybe flash a message?
              // alert("禁止重叠放置！(Overlap detected)");
              return;
          }

          // If no overlap, commit changes
          const data = builder.sceneData[sceneId];

          if (data) {
              if (viewMode === 'side') {
                  builder.updateObject(sceneId, { x: finalX, y: finalY }); 
              } else {
                  builder.updateObject(sceneId, { x: finalX, z: finalY }); 
              }
          }
          Matter.Body.setVelocity(body, { x: 0, y: 0 });
          // Ensure angular velocity is also reset to prevent spin after "violent" snap
          Matter.Body.setAngularVelocity(body, 0); 
          
          setVersion(v => v + 1);
          pushHistory();
      } else {
          console.warn('[handleDragEnd] Body not found for sceneId:', sceneId);
      }
  };

  const handleReset = () => {
    builder.clear();
    setObjects([]);
    setConstraints([]);
    setIsRunning(false);
    setGraphData([]);
    graphDataRef.current = [];
    setVersion(v => v + 1);
    pushHistory();
  };

  const renderGrid = () => {
      const width = window.innerWidth - 320;
      const height = window.innerHeight;
      const lines = [];
      const strokeColor = viewMode === 'top' ? '#e5e7eb' : '#f3f4f6'; 
      for (let x = 0; x < width; x += GRID_SIZE) {
          lines.push(<Line key={`v${x}`} points={[x, 0, x, height]} stroke={strokeColor} strokeWidth={1} listening={false} />);
      }
      for (let y = 0; y < height; y += GRID_SIZE) {
          lines.push(<Line key={`h${y}`} points={[0, y, width, y]} stroke={strokeColor} strokeWidth={1} listening={false} />);
      }
      return lines;
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden select-none font-sans text-gray-800">
      {/* Left Sidebar (Tools) */}
      <div className="w-64 bg-white flex flex-col py-6 shadow-xl z-30 overflow-y-auto border-r border-gray-100 px-4">
        
        <div className="mb-6 flex items-center gap-3 px-2">
            <div className="p-2 bg-blue-600 rounded-xl shadow-lg shadow-blue-900/20">
                <Box className="text-white" size={20} />
            </div>
            <span className="font-black text-gray-800 tracking-tight text-lg">工具箱</span>
        </div>



        <CollapsibleSection title="基础工具">
            <ToolButton icon={<MousePointer />} active={tool === 'select'} onClick={() => setTool('select')} tooltip="选择" />
            <ToolButton icon={<Move />} active={tool === 'move'} onClick={() => setTool('move')} tooltip="移动视图" />

            <ToolButton icon={<Scissors />} active={tool === 'cut'} onClick={() => setTool('cut')} tooltip="切割" />
        </CollapsibleSection>
        
        <CollapsibleSection title="刚体对象">
            <ToolButton icon={<Square />} active={tool === 'rect'} onClick={() => setTool('rect')} tooltip="矩形" />
            <ToolButton icon={<CircleIcon />} active={tool === 'circle'} onClick={() => setTool('circle')} tooltip="圆形" />
            <ToolButton icon={<Cone />} active={tool === 'cone'} onClick={() => setTool('cone')} tooltip="圆锥" />
            <ToolButton icon={<Hexagon />} active={tool === 'polygon'} onClick={() => setTool('polygon')} tooltip="多边形" />
            <ToolButton icon={<Tent />} active={tool === 'trapezoid'} onClick={() => setTool('trapezoid')} tooltip="梯形" />

        </CollapsibleSection>
        
        <CollapsibleSection title="环境构建">
            <ToolButton icon={<Grid />} active={tool === 'ground'} onClick={() => setTool('ground')} tooltip="地面" />
            <ToolButton icon={<Layers />} active={tool === 'wall'} onClick={() => setTool('wall')} tooltip="墙壁" />
            <ToolButton icon={<Triangle />} active={tool === 'ramp'} onClick={() => setTool('ramp')} tooltip="斜面" />
            <ToolButton icon={<ArrowRight />} active={tool === 'conveyor'} onClick={() => setTool('conveyor')} tooltip="传送带" />
        </CollapsibleSection>
        
        <CollapsibleSection title="连接约束">
             <ToolButton icon={<Link />} active={tool === 'rope'} onClick={() => setTool('rope')} tooltip="绳索" />
             <ToolButton icon={<Activity />} active={tool === 'spring'} onClick={() => setTool('spring')} tooltip="弹簧" />
             <ToolButton icon={<Anchor />} active={tool === 'pulley'} onClick={() => setTool('pulley')} tooltip="滑轮组" />
             <ToolButton icon={<Zap />} active={tool === 'friction'} onClick={() => setTool('friction')} tooltip="动摩擦约束" />
         </CollapsibleSection>

         <CollapsibleSection title="力场与驱动">
             <ToolButton icon={<Navigation className="rotate-45" />} active={tool === 'force'} onClick={() => setTool('force')} tooltip="恒定力 (Constant Force)" />
             <ToolButton icon={<FastForward />} active={tool === 'velocity'} onClick={() => setTool('velocity')} tooltip="初速度 (Initial Velocity)" />
         </CollapsibleSection>

         <CollapsibleSection title="测量工具">
             <ToolButton icon={<Ruler />} active={tool === 'ruler'} onClick={() => setTool('ruler')} tooltip="测距尺" />
             <ToolButton icon={<Timer />} active={showStopwatch} onClick={() => setShowStopwatch(!showStopwatch)} tooltip="秒表" />
             <ToolButton icon={<Trash2 />} active={false} onClick={() => setRulers([])} tooltip="清除标尺" disabled={rulers.length === 0} />
         </CollapsibleSection>
      </div>

      {/* Main Stage Area */}
      <div className="flex-1 relative z-0 bg-white cursor-crosshair">
        <input type="file" id="load-file" className="hidden" accept=".json" onChange={handleLoad} />
        <Stage 
          width={window.innerWidth - (256 + 384)} 
          height={window.innerHeight} 
          onClick={handleStageClick}
          onMouseDown={handleStageMouseDown}
          onMouseMove={handleStageMouseMove}
          onMouseUp={handleStageMouseUp}
          onMouseLeave={handleStageMouseUp}
          onWheel={handleWheel}
          ref={stageRef}
          draggable={tool === 'move'}
        >
          <Layer>
            {snapToGrid && renderGrid()}
            
            {/* Constraints */}
            {constraints.map((cons, i) => {
                const isSelected = cons.id === selectedId;
                const props = {
                    key: cons.id || i,
                    points: cons.points,
                    stroke: isSelected ? '#2563eb' : cons.color,
                    strokeWidth: isSelected ? 4 : 2,
                    dash: cons.dash,
                    hitStrokeWidth: 10,
                    coilCount: cons.coilCount,
                    amplitude: cons.amplitude,
                    onClick: (e) => {
                        if (tool === 'select') {
                            setSelectedId(cons.id);
                            e.cancelBubble = true;
                        }
                    },
                    onMouseEnter: (e) => {
                        const container = e.target.getStage().container();
                        container.style.cursor = tool === 'select' ? 'pointer' : 'crosshair';
                    },
                    onMouseLeave: (e) => {
                        const container = e.target.getStage().container();
                        container.style.cursor = 'crosshair';
                    }
                };

                if (cons.type === 'spring') {
                    return <ZigzagLine {...props} />;
                }
                if (cons.type === 'pulley') {
                    const [x1, y1, x2, y2, x3, y3, x4, y4] = cons.points;
                    return (
                        <Group key={cons.id || i}>
                            <Line {...props} />
                            {/* Pulley Wheels at Fixed Points C and D */}
                            <Circle x={x2} y={y2} radius={8} fill="#f3f4f6" stroke={props.stroke} strokeWidth={2} />
                            <Circle x={x3} y={y3} radius={8} fill="#f3f4f6" stroke={props.stroke} strokeWidth={2} />
                            {/* Hubs */}
                            <Circle x={x2} y={y2} radius={3} fill={props.stroke} />
                            <Circle x={x3} y={y3} radius={3} fill={props.stroke} />
                        </Group>
                    );
                }
                if (cons.type === 'force') {
                    return (
                        <Arrow
                            key={cons.id || i}
                            points={cons.points}
                            stroke={props.stroke}
                            fill={props.stroke}
                            strokeWidth={3}
                            pointerLength={10}
                            pointerWidth={10}
                            onClick={props.onClick}
                            onMouseEnter={props.onMouseEnter}
                            onMouseLeave={props.onMouseLeave}
                        />
                    );
                }
                return <Line {...props} />;
            })}

            {/* Trajectory/Trace Visualization */}
            {Object.keys(builder.entities).map(id => {
                const entity = builder.entities[id];
                // Access trajectories from builder instance
                const trail = builder.trajectories ? builder.trajectories[id] : null;
                
                if (!trail || trail.length < 2) return null;
                
                return (
                    <Line
                        key={`trail-${id}`}
                        points={trail.flatMap(p => [p.x, p.y])}
                        stroke="#3b82f6"
                        strokeWidth={1}
                        dash={[2, 2]}
                        opacity={0.6}
                        listening={false}
                    />
                );
            })}

            {/* Connection Preview */}
            {connectionStart && (
                <>
                    <Line points={[connectionStart.viewX, connectionStart.viewY, mousePos.x, mousePos.y]} stroke="#e67e22" strokeWidth={2} dash={[5, 5]} />
                    <Circle x={connectionStart.viewX} y={connectionStart.viewY} radius={4} fill="#e67e22" />
                </>
            )}

            {/* Cut Preview */}
            {tool === 'cut' && cutStart && (
                <Line points={[cutStart.x, cutStart.y, mousePos.x, mousePos.y]} stroke="#ef4444" strokeWidth={2} dash={[4, 4]} />
            )}

            {/* Velocity Preview */}
            {tool === 'velocity' && velocityStart && (
                <Arrow 
                    points={[velocityStart.startX, velocityStart.startY, velocityStart.currentX, velocityStart.currentY]}
                    stroke="#ef4444"
                    fill="#ef4444"
                    strokeWidth={4}
                    pointerLength={10}
                    pointerWidth={10}
                    dash={[5, 5]}
                />
            )}

            {/* Snap Lines */}
            {snapLines.map((line, i) => (
                <Line key={`snap-${i}`} points={line} stroke="#f59e0b" strokeWidth={1} dash={[4, 4]} />
            ))}
            
            {/* Rulers */}
            {rulers.map((ruler) => {
                 const dx = ruler.x2 - ruler.x1;
                 const dy = ruler.y2 - ruler.y1;
                 const dist = Math.sqrt(dx*dx + dy*dy);
                 const midX = (ruler.x1 + ruler.x2) / 2;
                 const midY = (ruler.y1 + ruler.y2) / 2;
                 return (
                     <Group key={ruler.id}>
                         <Line points={[ruler.x1, ruler.y1, ruler.x2, ruler.y2]} stroke="#ef4444" strokeWidth={2} dash={[4, 4]} />
                         <Circle x={ruler.x1} y={ruler.y1} radius={4} fill="#ef4444" />
                         <Circle x={ruler.x2} y={ruler.y2} radius={4} fill="#ef4444" />
                         <Group x={midX} y={midY}>
                             <Rect width={60} height={20} offsetX={30} offsetY={10} fill="rgba(255,255,255,0.8)" cornerRadius={4} />
                             <Text 
                                text={`${Math.round(dist)} px`} 
                                fontSize={12} 
                                fill="#ef4444" 
                                align="center" 
                                width={60} 
                                offsetX={30} 
                                offsetY={6} 
                             />
                         </Group>
                     </Group>
                 );
            })}
            
            {/* Active Ruler Preview */}
            {tool === 'ruler' && rulerStart && (
                <Group>
                    <Line 
                        points={[rulerStart.x, rulerStart.y, mousePos.x, mousePos.y]} 
                        stroke="#ef4444" 
                        strokeWidth={2} 
                        dash={[4, 4]} 
                    />
                    <Text
                        text={`${Math.round(Math.sqrt(Math.pow(mousePos.x - rulerStart.x, 2) + Math.pow(mousePos.y - rulerStart.y, 2)))} px`}
                        x={(rulerStart.x + mousePos.x) / 2}
                        y={(rulerStart.y + mousePos.y) / 2}
                        fill="#ef4444"
                        fontSize={12}
                        offsetX={20}
                        offsetY={20}
                        listening={false}
                    />
                </Group>
            )}

            {/* Objects */}
            {objects
              .slice()
              .sort((a, b) => {
                const idA = a.plugin?.userLabel;
                const idB = b.plugin?.userLabel;
                const dataA = idA ? builder.sceneData[idA] : null;
                const dataB = idB ? builder.sceneData[idB] : null;
                if (!dataA || !dataB) return 0;
                return viewMode === 'side' ? (dataB.z || 0) - (dataA.z || 0) : (dataB.y || 0) - (dataA.y || 0);
              })
              .map((rawObj) => {
              if (rawObj.visible === false) return null;
              const data = builder.sceneData[rawObj.plugin.userLabel];
              if (!data) return null;

              const isPointMass = rawObj.isPointMass;
              const obj = {
                  ...rawObj,
                  width: isPointMass ? (rawObj.visualWidth || rawObj.width) : rawObj.width,
                  height: isPointMass ? (rawObj.visualHeight || rawObj.height) : rawObj.height,
                  radius: isPointMass ? (rawObj.visualRadius || rawObj.radius) : rawObj.radius,
                  vertices: isPointMass ? (rawObj.visualVertices || rawObj.vertices) : rawObj.vertices
              };
              const opacity = isPointMass ? 0.5 : 1;

              return (
              <Group 
                key={obj.id} 
                opacity={opacity} 
                ref={(node) => { shapeRefs.current[obj.plugin.userLabel] = node; }}
                x={obj.x} y={obj.y} 
                rotation={obj.angle * (180 / Math.PI)}
                draggable={tool === 'select' && !isRunning}
                onClick={(e) => handleObjectClick(e, obj.plugin.userLabel)}
                onDragMove={(e) => {
                    if (tool === 'select') {
                        const id = obj.plugin.userLabel;
                        const x = e.target.x();
                        const y = e.target.y();
                        const { x: sx, y: sy, lines } = getSnapPosition(id, x, y);
                        
                        // Apply snapping visual feedback
                        setSnapLines(lines);
                        
                        // Apply hard snapping for "magnetic" feel
                        e.target.x(sx);
                        e.target.y(sy);
                    }
                }}
                onDragEnd={(e) => handleDragEnd(e, obj.plugin.userLabel)}
                onTransformEnd={(e) => {
                    const node = e.target;
                    const scaleX = node.scaleX();
                    const scaleY = node.scaleY();
                    const rotation = node.rotation(); // Degrees
                    const id = obj.plugin.userLabel;
                    const sceneObj = builder.sceneData[id];

                    // Reset scale on Konva node
                    node.scaleX(1);
                    node.scaleY(1);

                    // Calculate updates
                    const updates = {};
                    const rad = rotation * (Math.PI / 180);
                    
                    if (viewMode === 'side') {
                        updates.angle = rad;
                        updates.x = node.x();
                        updates.y = node.y();
                        
                        // Apply scaling to dimensions
                        // For Radial objects, we now support non-uniform scaling too.
                        // We update width/height based on current dimensions * scale
                        
                        const currentWidth = sceneObj.width || (sceneObj.radius ? sceneObj.radius * 2 : 50);
                        const currentHeight = sceneObj.height || (sceneObj.radius ? sceneObj.radius * 2 : 50);

                        updates.width = currentWidth * scaleX;
                        updates.height = currentHeight * scaleY;

                        // Also update radius if it exists, roughly approximating (e.g. max half-dim)
                        // This keeps legacy compatibility if something relies solely on radius
                        if (sceneObj.radius) {
                             updates.radius = Math.max(updates.width, updates.height) / 2;
                        }

                    } else {
                        // Top View
                        updates.angleTop = rad;
                        updates.x = node.x();
                        updates.z = node.y();
                        
                        const currentWidth = sceneObj.width || (sceneObj.radius ? sceneObj.radius * 2 : 50);
                        const currentDepth = sceneObj.depth || (sceneObj.radius ? sceneObj.radius * 2 : 50);

                        updates.width = currentWidth * scaleX;
                        updates.depth = currentDepth * scaleY;
                        
                        if (sceneObj.radius) {
                             updates.radius = Math.max(updates.width, updates.depth) / 2;
                        }
                    }

                    builder.updateObject(id, updates);
                    setVersion(v => v + 1);
                    pushHistory();
                }}
                onMouseDown={(e) => handleObjectMouseDown(e, obj.plugin.userLabel)}
                onClick={(e) => {
                    if (tool === 'select') {
                        setSelectedId(obj.plugin.userLabel);
                        e.cancelBubble = true;
                    }
                    if (tool === 'rope' || tool === 'spring' || tool === 'friction') {
                        e.cancelBubble = true;
                        const id = obj.plugin.userLabel;
                        const data = builder.sceneData[id];
                        if (!connectionStart) {
                             setConnectionStart({ type: 'body', id: id, x: data.x, y: data.y, z: data.z, viewX: obj.x, viewY: obj.y });
                        } else {
                             // Create Connection Logic (Duplicated from Stage Click mostly)
                             const startX = connectionStart.x;
                             const startY = connectionStart.y;
                             const startZ = connectionStart.z;
                             const dist = Math.sqrt(Math.pow(data.x - startX, 2) + Math.pow(data.y - startY, 2) + Math.pow(data.z - startZ, 2));
                             const bodyAId = connectionStart.id, pointA = { x: 0, y: 0 };
                             const bodyBId = id, pointB = { x: 0, y: 0 };

                             if (tool === 'rope') builder.createIdealRope(Date.now().toString(), { bodyAId, bodyBId, pointA, pointB, length: dist || 100 });
                             else if (tool === 'spring') builder.createSpring(Date.now().toString(), { bodyAId, bodyBId, pointA, pointB, length: dist || 100, stiffness: 0.01, damping: 0.1 });
                             else if (tool === 'friction') {
                                 const val = prompt("请输入动摩擦系数 (0.0 - 1.0):", "0.5");
                                 if (val !== null) {
                                     const f = parseFloat(val);
                                     if (!isNaN(f)) {
                                         builder.createFrictionConstraint(Date.now().toString(), { bodyAId, bodyBId, friction: f });
                                     }
                                 }
                             }
                             
                             setConnectionStart(null);
                             setVersion(v => v + 1);
                        }
                    }
                }} 
              >
                {['Rectangle', 'Box', 'Ground', 'Wall', 'Conveyor'].includes(obj.type) && (
                  <Rect width={obj.width} height={obj.height} offsetX={obj.width/2} offsetY={obj.height/2} 
                    fill={obj.fillStyle || '#3b82f6'} stroke={obj.isStatic ? null : "rgba(0,0,0,0.2)"} strokeWidth={1} cornerRadius={2}
                    dash={obj.type === 'Conveyor' ? [10, 5] : null}
                    shadowColor="black" shadowBlur={obj.isStatic ? 0 : 5} shadowOpacity={0.1} shadowOffset={{x:2,y:2}}
                  />
                )}
                {(obj.type === 'Circle' || (obj.type === 'Cone' && viewMode === 'top')) && (
                  <Ellipse 
                     radiusX={obj.width ? obj.width/2 : obj.radius}
                     radiusY={obj.height ? obj.height/2 : obj.radius}
                     fill={obj.fillStyle || '#ef4444'} stroke="rgba(0,0,0,0.2)" strokeWidth={1} 
                     shadowColor="black" shadowBlur={5} shadowOpacity={0.1} shadowOffset={{x:2,y:2}}
                  />
                )}
                {obj.type === 'Text' && (
                  <Text
                    text={data.text || 'Label'}
                    x={-obj.width/2}
                    y={-obj.height/2}
                    width={obj.width}
                    height={obj.height}
                    align="center"
                    verticalAlign="middle"
                    fontSize={data.fontSize || 20}
                    fill={data.color || '#333333'}
                    fontFamily="sans-serif"
                    fontStyle="bold"
                  />
                )}
                {['Triangle', 'Incline', 'Polygon', 'Cone', 'Trapezoid', 'Capsule'].includes(obj.type) && !(obj.type === 'Cone' && viewMode === 'top') && (
                  <Line points={obj.vertices.flatMap(v => [v.x, v.y])} closed={true} fill={obj.fillStyle || '#e67e22'} stroke="rgba(0,0,0,0.2)" strokeWidth={1} 
                     shadowColor="black" shadowBlur={5} shadowOpacity={0.1} shadowOffset={{x:2,y:2}}
                  />
                )}
                {/* Point Mass Center Indicator */}
                {isPointMass && (
                    <Circle radius={3} fill="#000" stroke="white" strokeWidth={1} />
                )}
                {/* Object Label */}
                {data.name && (
                  <Text
                    text={data.name}
                    x={-100}
                    y={-7}
                    width={200}
                    align="center"
                    fontSize={14}
                    fontStyle="bold"
                    fill="white"
                    shadowColor="black"
                    shadowBlur={3}
                    shadowOpacity={1}
                    listening={false}
                  />
                )}
              </Group>
            );})}
            
            {/* Rotation Guide */}
            {(tool === 'rotate' && dragRef.current.activeId) || (dragRef.current.activeId && dragRef.current.isRotating) ? (
                <AngleGuide 
                    x={builder.sceneData[dragRef.current.activeId].x}
                    y={viewMode === 'side' ? builder.sceneData[dragRef.current.activeId].y : builder.sceneData[dragRef.current.activeId].z}
                    angle={
                        (dragRef.current.isRotating && dragRef.current.currentRotation !== undefined) 
                        ? dragRef.current.currentRotation * (Math.PI / 180) 
                        : (viewMode === 'side' ? (builder.sceneData[dragRef.current.activeId].angle || 0) : (builder.sceneData[dragRef.current.activeId].angleTop || 0))
                    }
                />
            ) : null}

            {/* Visualizations: Trajectory & Vectors */}
            {showTrajectory && Object.entries(trajectoryRef.current).map(([id, points]) => (
                <Line
                    key={`traj-${id}`}
                    points={points.flatMap(p => [p.x, p.y])}
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    dash={[5, 5]}
                    tension={0.5}
                    listening={false}
                    opacity={0.6}
                />
            ))}

            {showVectors && Object.entries(telemetry).map(([id, data]) => {
                if (!data) return null;
                const { velocity, position } = data; // Force is usually 0 unless we capture it perfectly, use Velocity for now
                // Velocity Vector
                const vScale = 10; // Scale factor
                if (Math.abs(velocity.x) < 0.1 && Math.abs(velocity.y) < 0.1) return null;
                
                return (
                    <Arrow
                        key={`vec-${id}`}
                        points={[position.x, position.y, position.x + velocity.x * vScale, position.y + velocity.y * vScale]}
                        pointerLength={6}
                        pointerWidth={6}
                        fill="#10b981"
                        stroke="#10b981"
                        strokeWidth={2}
                        listening={false}
                    />
                );
            })}

            <Transformer 
                ref={trRef}
                rotationSnaps={[0, 30, 37, 45, 53, 60, 90, 120, 127, 135, 143, 150, 180, 210, 217, 225, 233, 240, 270, 300, 307, 315, 323, 330]}
                onTransformStart={() => {
                    if (trRef.current.getActiveAnchor() === 'rotater') {
                         dragRef.current = { 
                             activeId: selectedId,
                             isRotating: true,
                             currentRotation: trRef.current.nodes()[0].rotation()
                         };
                         setVersion(v => v + 1);
                    }
                }}
                onTransform={() => {
                     // Check if rotating (Transformer can also scale)
                     // If rotater is active anchor, or we just track rotation change
                     const node = trRef.current.nodes()[0];
                     if (dragRef.current.isRotating && node) {
                         dragRef.current.currentRotation = node.rotation();
                         setVersion(v => v + 1); // Update guide during rotation
                     }
                }}
                onTransformEnd={() => {
                    dragRef.current = {};
                    setVersion(v => v + 1);
                }}
                boundBoxFunc={(oldBox, newBox) => {
                    // Limit minimum size
                    if (newBox.width < 5 || newBox.height < 5) {
                        return oldBox;
                    }
                    return newBox;
                }}
                {...(() => {
                    // Only show transformer in select mode
                    if (!selectedId || tool !== 'select') return { visible: false, enabled: false };
                    // We allow non-uniform scaling for ALL objects now.
                    // The backend (PhysicsEngine) will handle the shape updates (e.g. ellipses).
                    return {
                        keepRatio: false,
                        enabled: true,
                        visible: true
                    };
                })()}
            />
          </Layer>
        </Stage>

        {/* Top Floating Control Bar */}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-3 z-50">
             {/* Simulation Group */}
             <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-xl border border-white/20 p-1.5 flex items-center gap-1">
                  <button onClick={() => setIsRunning(!isRunning)}
                    className={`p-3 rounded-xl transition-all active:scale-95 ${isRunning ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200'}`}
                    title={isRunning ? "暂停 (Pause)" : "开始 (Play)"}
                  >
                    {isRunning ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                  </button>
                  <button onClick={handleReset} className="p-3 rounded-xl bg-gray-100 text-gray-600 hover:bg-red-100 hover:text-red-600 transition-all active:scale-95" title="重置 (Reset)">
                    <RotateCcw size={20} />
                  </button>
             </div>

             {/* Status Group */}
             <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-xl border border-white/20 px-4 py-3 flex items-center gap-3 min-w-[120px] justify-center">
                  <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`} />
                  <span className="text-xs font-mono font-medium text-gray-600">
                    OBJ: {objects.length}
                  </span>
             </div>

             {/* History & File Group */}
             <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-xl border border-white/20 p-1.5 flex items-center gap-1">
                  <button onClick={handleUndo} disabled={historyIndex <= 0}
                    className={`p-3 rounded-xl transition-all ${historyIndex > 0 ? 'text-gray-600 hover:bg-gray-100' : 'text-gray-300'}`}
                    title="撤销 (Undo)"
                  >
                    <Undo2 size={20} />
                  </button>
                  <button onClick={handleRedo} disabled={historyIndex >= history.length - 1}
                    className={`p-3 rounded-xl transition-all ${historyIndex < history.length - 1 ? 'text-gray-600 hover:bg-gray-100' : 'text-gray-300'}`}
                    title="重做 (Redo)"
                  >
                    <Redo2 size={20} />
                  </button>
                  <div className="w-px h-6 bg-gray-200 mx-1" />
                  <button onClick={handleSave} className="p-3 rounded-xl text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition-all" title="保存 (Save)">
                    <Save size={20} />
                  </button>
                  <label htmlFor="load-file" className="p-3 rounded-xl text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition-all cursor-pointer" title="加载 (Load)">
                    <Upload size={20} />
                  </label>
             </div>

             {/* View Group */}
             <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-xl border border-white/20 p-1.5 flex items-center gap-1">
                  <button onClick={() => setSnapToGrid(!snapToGrid)} 
                    className={`p-3 rounded-xl transition-all ${snapToGrid ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:bg-gray-100'}`}
                    title="网格吸附 (Grid Snap)"
                  >
                    <Grid size={20} />
                  </button>
                  <button onClick={() => setShowVectors(!showVectors)} 
                    className={`p-3 rounded-xl transition-all ${showVectors ? 'bg-emerald-100 text-emerald-600' : 'text-gray-400 hover:bg-gray-100'}`}
                    title="显示速度矢量 (Show Vectors)"
                  >
                    <Navigation size={20} className="rotate-45" />
                  </button>
                  <button onClick={() => setShowTrajectory(!showTrajectory)} 
                    className={`p-3 rounded-xl transition-all ${showTrajectory ? 'bg-purple-100 text-purple-600' : 'text-gray-400 hover:bg-gray-100'}`}
                    title="显示轨迹 (Show Trajectory)"
                  >
                    <TrendingUp size={20} />
                  </button>
                  <div className="w-px h-6 bg-gray-200 mx-1" />
                  <button 
                    onClick={() => setViewMode('side')}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all ${viewMode === 'side' ? 'bg-gray-800 text-white shadow-lg' : 'text-gray-500 hover:bg-gray-100'}`}
                  >
                    <Monitor size={14} /> 侧视
                  </button>
                  <button 
                    onClick={() => setViewMode('top')}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all ${viewMode === 'top' ? 'bg-gray-800 text-white shadow-lg' : 'text-gray-500 hover:bg-gray-100'}`}
                  >
                    <Layers size={14} /> 俯视
                  </button>
                  <div className="w-px h-6 bg-gray-200 mx-1" />
                  <button onClick={() => setShowGraphPanel(!showGraphPanel)} className={`p-3 rounded-xl transition-all ${showGraphPanel ? 'bg-purple-100 text-purple-600' : 'text-gray-600 hover:bg-purple-50 hover:text-purple-600'}`} title="运动图表 (Motion Graphs)">
                    <Activity size={20} />
                  </button>
             </div>
        </div>

        {/* Stopwatch Panel */}
        {showStopwatch && (
            <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-md shadow-xl rounded-2xl p-4 border border-white/20 flex flex-col items-center gap-1 animate-in fade-in slide-in-from-top-4 z-50 pointer-events-none select-none">
                  <div className="text-4xl font-mono font-black text-gray-800 tabular-nums tracking-tighter">
                      {(engine.timing.timestamp / 1000).toFixed(2)}
                      <span className="text-lg text-gray-400 font-sans font-medium ml-1">s</span>
                  </div>
                  <div className="text-[10px] text-blue-500 font-bold uppercase tracking-widest">Simulation Time</div>
            </div>
        )}

        {/* Preview Map */}
        {isAdjustingGlobal && (
            <div className="absolute top-24 right-6 bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl border border-white/20 z-50 p-3 transition-all duration-300 animate-in fade-in slide-in-from-right-4">
                <div className="text-[10px] font-bold text-gray-400 mb-2 text-center uppercase tracking-wider">
                    {viewMode === 'side' ? '深度预览' : '高度预览'}
                </div>
                <MiniMap 
                    data={builder.sceneData} 
                    viewMode={viewMode === 'side' ? 'top' : 'side'} 
                    indicatorValue={viewMode === 'side' ? defaultPlacementZ : defaultPlacementY}
                    width={200} height={150}
                />
            </div>
        )}

        {/* Reference Axis */}
        {showGraphPanel && (
            <ReferenceAxis viewMode={viewMode} />
        )}
      </div>

      {/* Right Sidebar (Properties) */}
      <div className="w-96 bg-white border-l border-gray-100 flex flex-col shadow-xl z-20">
        <div className="p-6 pb-4">
          <h2 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
             <Settings size={20} className="text-blue-600" /> 属性面板
          </h2>
          <p className="text-xs text-gray-400 mt-1">PROPERTIES & SETTINGS</p>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 pt-0">
            {(() => {
                const selectedObj = builder.sceneData[selectedId];
                const selectedConstraint = !selectedObj && builder.customConstraints ? builder.customConstraints.find(c => c.id === selectedId) : null;
                
                if (selectedObj) {
                    const data = selectedObj;
                    return (
                      <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                            <p className="text-[10px] text-gray-400 uppercase font-bold mb-1 tracking-wider">当前选中</p>
                            <div className="flex items-center justify-between">
                                <p className="font-mono text-sm font-bold text-gray-700 truncate w-32" title={selectedId}>{selectedId}</p>
                                <span className="px-2 py-0.5 bg-blue-100 text-blue-600 text-[10px] font-bold rounded-full uppercase">
                                    {data.type}
                                </span>
                            </div>
                        </div>
                        
                        <div className="space-y-5">
                            {/* Name Input */}
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">名称 (Name)</label>
                                <input 
                                    type="text" 
                                    value={data.name || ''} 
                                    placeholder="物体名称 (Object Name)"
                                    className="w-full bg-gray-50 border-none rounded-lg text-sm font-medium p-2 focus:ring-2 focus:ring-blue-500 transition-all"
                                    onChange={(e) => { 
                                        builder.updateObject(selectedId, { name: e.target.value }); 
                                        setVersion(v => v + 1); 
                                    }}
                                />
                            </div>

                            {/* Position Group */}
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">变换 (Transform)</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <span className="text-[10px] text-gray-400">X轴</span>
                                        <input type="number" value={data.x || 0} className="w-full bg-gray-50 border-none rounded-lg text-sm font-mono p-2 focus:ring-2 focus:ring-blue-500 transition-all"
                                            onChange={(e) => { builder.updateObject(selectedId, { x: parseFloat(e.target.value) }); setVersion(v=>v+1); }}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-[10px] text-gray-400">Y轴</span>
                                        <input type="number" value={data.y || 0} className="w-full bg-gray-50 border-none rounded-lg text-sm font-mono p-2 focus:ring-2 focus:ring-blue-500 transition-all"
                                            onChange={(e) => { builder.updateObject(selectedId, { y: parseFloat(e.target.value) }); setVersion(v=>v+1); }}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-[10px] text-gray-400">Z轴</span>
                                        <input type="number" value={data.z || 0} className="w-full bg-gray-50 border-none rounded-lg text-sm font-mono p-2 focus:ring-2 focus:ring-blue-500 transition-all"
                                            onChange={(e) => { builder.updateObject(selectedId, { z: parseFloat(e.target.value) }); setVersion(v=>v+1); }}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-[10px] text-gray-400">角度 (°)</span>
                                        <input type="number" 
                                            value={Math.round(((viewMode === 'side' ? (data.angle || 0) : (data.angleTop || 0)) * (180/Math.PI)) * 10) / 10} 
                                            step="1"
                                            className="w-full bg-gray-50 border-none rounded-lg text-sm font-mono p-2 focus:ring-2 focus:ring-blue-500 transition-all"
                                            onChange={(e) => { 
                                                const val = parseFloat(e.target.value);
                                                if (!isNaN(val)) {
                                                    const rad = val * (Math.PI / 180);
                                                    if (viewMode === 'side') {
                                                        builder.updateObject(selectedId, { angle: rad });
                                                    } else {
                                                        builder.updateObject(selectedId, { angleTop: rad });
                                                    }
                                                    setVersion(v=>v+1); 
                                                }
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Dimensions */}
                            <div className="grid grid-cols-2 gap-3">
                                {data.width !== undefined && (
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">宽度</label>
                                        <input type="number" value={data.width || 0} className="w-full bg-gray-50 border-none rounded-lg text-sm p-2 focus:ring-2 focus:ring-blue-500"
                                            onChange={(e) => { builder.updateObject(selectedId, { width: parseFloat(e.target.value) }); setVersion(v=>v+1); }}
                                        />
                                    </div>
                                )}
                                {data.height !== undefined && (
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">高度</label>
                                        <input type="number" value={data.height || 0} className="w-full bg-gray-50 border-none rounded-lg text-sm p-2 focus:ring-2 focus:ring-blue-500"
                                            onChange={(e) => { builder.updateObject(selectedId, { height: parseFloat(e.target.value) }); setVersion(v=>v+1); }}
                                        />
                                    </div>
                                )}
                                {data.radius !== undefined && (
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">半径</label>
                                        <input type="number" value={data.radius || 0} className="w-full bg-gray-50 border-none rounded-lg text-sm p-2 focus:ring-2 focus:ring-blue-500"
                                            onChange={(e) => { 
                                                const r = parseFloat(e.target.value);
                                                builder.updateObject(selectedId, { 
                                                    radius: r,
                                                    width: r * 2,
                                                    height: r * 2,
                                                    depth: r * 2
                                                }); 
                                                setVersion(v=>v+1); 
                                            }}
                                        />
                                    </div>
                                )}

                                {/* Force Properties */}
                                {data.type === 'force' && (
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-400 uppercase mb-2 block">力向量 (Force Vector)</label>
                                        <div className="space-y-3">
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <span className="text-[10px] text-gray-400">X (N)</span>
                                                    <input type="number" value={data.vector?.x || 0} step="0.0001" className="w-full bg-white border border-gray-200 rounded text-xs p-1"
                                                        onChange={(e) => { 
                                                            const newVec = { ...data.vector, x: parseFloat(e.target.value) };
                                                            builder.updateObject(selectedId, { vector: newVec }); 
                                                            setVersion(v=>v+1); 
                                                        }}
                                                    />
                                                </div>
                                                <div>
                                                    <span className="text-[10px] text-gray-400">Y (N)</span>
                                                    <input type="number" value={data.vector?.y || 0} step="0.0001" className="w-full bg-white border border-gray-200 rounded text-xs p-1"
                                                        onChange={(e) => { 
                                                            const newVec = { ...data.vector, y: parseFloat(e.target.value) };
                                                            builder.updateObject(selectedId, { vector: newVec }); 
                                                            setVersion(v=>v+1); 
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                            
                                            {/* Magnitude and Angle helper */}
                                            <div className="p-2 bg-blue-50 rounded text-[10px] text-blue-600">
                                                <div>Magnitude: {Math.sqrt((data.vector?.x||0)**2 + (data.vector?.y||0)**2).toFixed(5)} N</div>
                                                <div>Angle: {(Math.atan2(data.vector?.y||0, data.vector?.x||0) * 180 / Math.PI).toFixed(1)}°</div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            
                            <div className="h-px bg-gray-100 my-4" />

                            {/* Text Properties */}
                            {data.type === 'Text' && (
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">文本内容 (Content)</label>
                                    <input type="text" value={data.text || ''} 
                                        className="w-full bg-gray-50 border-none rounded-lg text-sm p-2 focus:ring-2 focus:ring-blue-500 mb-3"
                                        onChange={(e) => { builder.updateObject(selectedId, { text: e.target.value }); setVersion(v=>v+1); }}
                                    />
                                    
                                    <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">字体大小 (Size)</label>
                                    <input type="number" value={data.fontSize || 20} step="1" min="10" max="100"
                                        className="w-full bg-gray-50 border-none rounded-lg text-sm p-2 focus:ring-2 focus:ring-blue-500"
                                        onChange={(e) => { 
                                            const size = parseInt(e.target.value);
                                            // Update dimensions based on approximate text size
                                            const width = (data.text || '').length * size * 0.6;
                                            builder.updateObject(selectedId, { fontSize: size, width, height: size }); 
                                            setVersion(v=>v+1); 
                                        }}
                                    />
                                    <div className="h-px bg-gray-100 my-4" />
                                </div>
                            )}

                            {/* Physics Properties */}
                            {data.type !== 'Text' && (
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">物理属性 (Physics)</label>
                                <div className="space-y-3">
                                    {!data.isStatic && (
                                        <div>
                                            <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                                                <span>质量 (Mass)</span>
                                                <span>{data.mass || 1} kg</span>
                                            </div>
                                            <input type="number" value={data.mass || 1} step="0.1" min="0.1" 
                                                className="w-full bg-gray-50 border-none rounded-lg text-sm p-2 focus:ring-2 focus:ring-blue-500"
                                                onChange={(e) => { builder.updateObject(selectedId, { mass: parseFloat(e.target.value) }); setVersion(v=>v+1); }}
                                            />
                                        </div>
                                    )}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">摩擦系数 (Friction)</label>
                                            <input type="number" value={data.friction || 0.1} step="0.1" min="0" max="1" 
                                                className="w-full bg-gray-50 border-none rounded-lg text-sm p-2 focus:ring-2 focus:ring-blue-500"
                                                onChange={(e) => { builder.updateObject(selectedId, { friction: parseFloat(e.target.value) }); setVersion(v=>v+1); }}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">弹性 (Restitution)</label>
                                            <input type="number" value={data.restitution || 0} step="0.1" min="0" max="1.5" 
                                                className="w-full bg-gray-50 border-none rounded-lg text-sm p-2 focus:ring-2 focus:ring-blue-500"
                                                onChange={(e) => { builder.updateObject(selectedId, { restitution: parseFloat(e.target.value) }); setVersion(v=>v+1); }}
                                            />
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">空气阻力 (Air Resistance)</label>
                                        <input type="number" value={data.frictionAir !== undefined ? data.frictionAir : (builder.globalAirResistance || 0)} step="0.001" min="0" max="1" 
                                            className="w-full bg-gray-50 border-none rounded-lg text-sm p-2 focus:ring-2 focus:ring-blue-500"
                                            onChange={(e) => { builder.updateObject(selectedId, { frictionAir: parseFloat(e.target.value) }); setVersion(v=>v+1); }}
                                        />
                                        <div className="text-[9px] text-gray-400 mt-0.5">0 = 无阻力 (Vacuum), 0.01 = 典型值 (Standard)</div>
                                    </div>
                                    
                                    {/* Trajectory Toggle */}
                                    <div className="mt-3 p-2 bg-blue-50 rounded-lg flex items-center justify-between">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" 
                                                checked={!!data.showTrajectory} 
                                                onChange={(e) => { builder.updateObject(selectedId, { showTrajectory: e.target.checked }); setVersion(v=>v+1); }}
                                                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                            />
                                            <span className="text-xs font-bold text-gray-600">显示轨迹</span>
                                        </label>
                                        {data.showTrajectory && (
                                            <button 
                                                onClick={() => { builder.clearTrajectory(selectedId); setVersion(v=>v+1); }}
                                                className="text-[10px] text-blue-500 hover:text-blue-700 font-bold px-2 py-1 bg-white rounded border border-blue-200 hover:bg-blue-50 transition-colors"
                                            >
                                                清除 (Clear)
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                            )}

                            {/* Initial Velocity */}
                            {data.type !== 'Text' && !data.isStatic && (
                                <div className="mt-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
                                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-200">
                                        <Zap size={14} className="text-amber-500" />
                                        <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">初速度 (Initial Velocity)</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[10px] text-gray-400 mb-1 block">Vx (m/s)</label>
                                            <input 
                                                type="number" step="0.1" 
                                                value={data.velocity ? data.velocity.x : 0} 
                                                onChange={(e) => {
                                                    const newVx = parseFloat(e.target.value);
                                                    const currentVy = data.velocity ? data.velocity.y : 0;
                                                    builder.updateObject(selectedId, { velocity: { x: newVx, y: currentVy } });
                                                    setVersion(v => v + 1);
                                                }}
                                                className="w-full bg-white border border-gray-200 rounded-lg text-sm p-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-gray-400 mb-1 block">Vy (m/s)</label>
                                            <input 
                                                type="number" step="0.1" 
                                                value={data.velocity ? data.velocity.y : 0} 
                                                onChange={(e) => {
                                                    const newVy = parseFloat(e.target.value);
                                                    const currentVx = data.velocity ? data.velocity.x : 0;
                                                    builder.updateObject(selectedId, { velocity: { x: currentVx, y: newVy } });
                                                    setVersion(v => v + 1);
                                                }}
                                                className="w-full bg-white border border-gray-200 rounded-lg text-sm p-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Real-time Monitor */}
                            {data.type !== 'Text' && !data.isStatic && (
                                <div className="mt-4 p-3 bg-slate-800 rounded-xl text-white shadow-lg border border-slate-700">
                                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-700">
                                        <Activity size={14} className="text-blue-400" />
                                        <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">实时监测 (Real-time)</span>
                                    </div>
                                    {(() => {
                                        const body = builder.entities[selectedId];
                                        if (!body) return <div className="text-xs text-gray-500 italic">Simulation not active</div>;
                                        
                                        const speed = body.speed.toFixed(2);
                                        const velX = body.velocity.x.toFixed(2);
                                        const velY = body.velocity.y.toFixed(2);
                                        const ke = (0.5 * body.mass * body.speed * body.speed).toFixed(1);
                                        const mom = (body.mass * body.speed).toFixed(1);
                                        
                                        return (
                                            <div className="space-y-2 text-xs font-mono">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-slate-400">速率 (Speed)</span>
                                                    <span className="text-blue-400 font-bold">{speed} <span className="text-[10px] text-slate-500 font-normal">m/s</span></span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-slate-400">速度 (Velocity)</span>
                                                    <span className="text-slate-200">({velX}, {velY})</span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-slate-400">动能 (KE)</span>
                                                    <span className="text-emerald-400 font-bold">{ke} <span className="text-[10px] text-slate-500 font-normal">J</span></span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-slate-400">动量 (Momentum)</span>
                                                    <span className="text-purple-400 font-bold">{mom} <span className="text-[10px] text-slate-500 font-normal">kg·m/s</span></span>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}

                            <div className="h-px bg-gray-100 my-4" />
                            
                            {/* Appearance */}
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">样式 (Style)</label>
                                <div className="flex items-center gap-3">
                                    <input type="color" value={data.color} className="w-10 h-10 rounded-lg border-none cursor-pointer"
                                        onChange={(e) => { builder.updateObject(selectedId, { color: e.target.value }); setVersion(v=>v+1); }}
                                    />
                                    <div className="flex-1">
                                        <div className="text-sm font-medium text-gray-700">{data.color}</div>
                                        <div className="text-xs text-gray-400">填充颜色</div>
                                    </div>
                                </div>
                            </div>

                            {data.type !== 'Text' && (
                            <>
                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100 mt-4">
                                <div>
                                    <div className="text-sm font-bold text-gray-700">静态物体</div>
                                    <div className="text-xs text-gray-400">不受重力影响</div>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" checked={data.isStatic} className="sr-only peer"
                                        onChange={(e) => { builder.updateObject(selectedId, { isStatic: e.target.checked }); setVersion(v=>v+1); }}
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                </label>
                            </div>

                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100 mt-4">
                                <div>
                                    <div className="text-sm font-bold text-gray-700">质点 (Point Mass)</div>
                                    <div className="text-xs text-gray-400">无体积，有质量，位于重心</div>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" checked={!!data.isPointMass} className="sr-only peer"
                                        onChange={(e) => { builder.updateObject(selectedId, { isPointMass: e.target.checked }); setVersion(v=>v+1); }}
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                </label>
                            </div>
                            </>
                            )}
                        </div>
                      </div>
                    );
                } else if (selectedConstraint) {
                    const data = selectedConstraint;
                    return (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="bg-orange-50 p-4 rounded-2xl border border-orange-100">
                                <p className="text-[10px] text-orange-400 uppercase font-bold mb-1 tracking-wider">当前选中</p>
                                <div className="flex items-center justify-between">
                                    <p className="font-mono text-sm font-bold text-gray-700 truncate w-32" title={selectedId}>{selectedId}</p>
                                    <span className="px-2 py-0.5 bg-orange-100 text-orange-600 text-[10px] font-bold rounded-full uppercase">
                                        {data.type === 'spring' ? '弹簧' : '绳索'}
                                    </span>
                                </div>
                            </div>

                            <div className="space-y-5">
                                {/* Common Properties */}
                                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                                    <div>
                                        <div className="text-sm font-bold text-gray-700">轻质 (Lightweight)</div>
                                        <div className="text-xs text-gray-400">忽略自身质量</div>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" checked={data.isLight !== false} className="sr-only peer"
                                            onChange={(e) => { builder.updateObject(selectedId, { isLight: e.target.checked }); setVersion(v=>v+1); }}
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                    </label>
                                </div>
                                )}

                                {data.isLight === false && (
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">质量 (Mass)</label>
                                        <input type="number" value={data.mass || 0.1} step="0.1" className="w-full bg-gray-50 border-none rounded-lg text-sm p-2 focus:ring-2 focus:ring-blue-500"
                                            onChange={(e) => { builder.updateObject(selectedId, { mass: parseFloat(e.target.value) }); setVersion(v=>v+1); }}
                                        />
                                    </div>
                                )}

                                {/* Spring Properties */}
                                {(data.type === 'spring' || (data.type === 'ideal_rope' && data.isElastic)) && (
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">劲度系数 (Stiffness)</label>
                                        <input type="number" value={data.stiffness || 0} step="0.01" className="w-full bg-gray-50 border-none rounded-lg text-sm p-2 focus:ring-2 focus:ring-blue-500"
                                            onChange={(e) => { builder.updateObject(selectedId, { stiffness: parseFloat(e.target.value) }); setVersion(v=>v+1); }}
                                        />

                                        {data.type === 'spring' && (
                                            <div className="grid grid-cols-2 gap-3 mt-3">
                                                <div>
                                                    <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">线圈数 (Coils)</label>
                                                    <input type="number" value={data.coilCount || 10} step="1" min="1" className="w-full bg-gray-50 border-none rounded-lg text-sm p-2 focus:ring-2 focus:ring-blue-500"
                                                        onChange={(e) => { builder.updateObject(selectedId, { coilCount: parseInt(e.target.value) }); setVersion(v=>v+1); }}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">振幅 (Amplitude)</label>
                                                    <input type="number" value={data.amplitude || 8} step="1" min="1" className="w-full bg-gray-50 border-none rounded-lg text-sm p-2 focus:ring-2 focus:ring-blue-500"
                                                        onChange={(e) => { builder.updateObject(selectedId, { amplitude: parseFloat(e.target.value) }); setVersion(v=>v+1); }}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Rope Properties */}
                                {data.type === 'ideal_rope' && (
                                    <>
                                        <div>
                                            <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">最大承受拉力 (Max Tension)</label>
                                            <input type="number" value={data.maxForce || 0} placeholder="0 (Unlimited)" className="w-full bg-gray-50 border-none rounded-lg text-sm p-2 focus:ring-2 focus:ring-blue-500"
                                                onChange={(e) => { builder.updateObject(selectedId, { maxForce: parseFloat(e.target.value) }); setVersion(v=>v+1); }}
                                            />
                                        </div>
                                        
                                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100 mt-2">
                                            <div>
                                                <div className="text-sm font-bold text-gray-700">弹性 (Elastic)</div>
                                                <div className="text-xs text-gray-400">是否具有弹性</div>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input type="checkbox" checked={data.isElastic || false} className="sr-only peer"
                                                    onChange={(e) => { builder.updateObject(selectedId, { isElastic: e.target.checked }); setVersion(v=>v+1); }}
                                                />
                                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                            </label>
                                        </div>
                                    </>
                                )}

                                {/* Pulley Properties */}
                                {data.type === 'pulley' && (
                                    <div>
                                        <div className="mb-4">
                                            <label className="text-[10px] font-bold text-gray-400 uppercase mb-2 block">绳索总长 (Total Length)</label>
                                            <input type="number" value={data.length || 0} className="w-full bg-gray-50 border-none rounded-lg text-sm p-2 focus:ring-2 focus:ring-blue-500"
                                                onChange={(e) => { builder.updateObject(selectedId, { length: parseFloat(e.target.value) }); setVersion(v=>v+1); }}
                                            />
                                        </div>
                                        
                                        <label className="text-[10px] font-bold text-gray-400 uppercase mb-2 block">定滑轮位置 (Fixed Points)</label>
                                        <div className="space-y-3">
                                            {/* Point C */}
                                            <div className="p-3 bg-gray-50 rounded-lg">
                                                <div className="text-xs font-bold text-gray-500 mb-2">Point 1 (Left/Top)</div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <span className="text-[10px] text-gray-400">X</span>
                                                        <input type="number" value={data.pointC?.x || 0} className="w-full bg-white border border-gray-200 rounded text-xs p-1"
                                                            onChange={(e) => { 
                                                                const newC = { ...data.pointC, x: parseFloat(e.target.value) };
                                                                builder.updateObject(selectedId, { pointC: newC }); 
                                                                setVersion(v=>v+1); 
                                                            }}
                                                        />
                                                    </div>
                                                    <div>
                                                        <span className="text-[10px] text-gray-400">Y</span>
                                                        <input type="number" value={data.pointC?.y || 0} className="w-full bg-white border border-gray-200 rounded text-xs p-1"
                                                            onChange={(e) => { 
                                                                const newC = { ...data.pointC, y: parseFloat(e.target.value) };
                                                                builder.updateObject(selectedId, { pointC: newC }); 
                                                                setVersion(v=>v+1); 
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Point D */}
                                            <div className="p-3 bg-gray-50 rounded-lg">
                                                <div className="text-xs font-bold text-gray-500 mb-2">Point 2 (Right/Bottom)</div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <span className="text-[10px] text-gray-400">X</span>
                                                        <input type="number" value={data.pointD?.x || 0} className="w-full bg-white border border-gray-200 rounded text-xs p-1"
                                                            onChange={(e) => { 
                                                                const newD = { ...data.pointD, x: parseFloat(e.target.value) };
                                                                builder.updateObject(selectedId, { pointD: newD }); 
                                                                setVersion(v=>v+1); 
                                                            }}
                                                        />
                                                    </div>
                                                    <div>
                                                        <span className="text-[10px] text-gray-400">Y</span>
                                                        <input type="number" value={data.pointD?.y || 0} className="w-full bg-white border border-gray-200 rounded text-xs p-1"
                                                            onChange={(e) => { 
                                                                const newD = { ...data.pointD, y: parseFloat(e.target.value) };
                                                                builder.updateObject(selectedId, { pointD: newD }); 
                                                                setVersion(v=>v+1); 
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                } else {
                    return (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                             <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex items-center gap-3">
                                <div className="p-2 bg-white rounded-xl shadow-sm">
                                    <Settings size={20} className="text-gray-400" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-gray-700">全局环境</p>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">World Settings</p>
                                </div>
                             </div>

                             <div className="space-y-5">
                                 {/* Gravity Y */}
                                 <div>
                                    <div className="flex justify-between text-xs font-medium text-gray-600 mb-2">
                                        <span>重力 Y (Gravity)</span>
                                        <span className="bg-white px-2 py-0.5 rounded shadow-sm text-gray-400">{globalSettings.gravity.y.toFixed(1)}</span>
                                    </div>
                                    <input type="range" min="-5" max="20" step="0.5" 
                                        value={globalSettings.gravity.y} 
                                        className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                        onChange={(e) => setGlobalSettings(prev => ({ ...prev, gravity: { ...prev.gravity, y: parseFloat(e.target.value) } }))}
                                    />
                                 </div>

                                 {/* Gravity X (Wind) */}
                                 <div>
                                    <div className="flex justify-between text-xs font-medium text-gray-600 mb-2">
                                        <span>水平重力/风 (Wind)</span>
                                        <span className="bg-white px-2 py-0.5 rounded shadow-sm text-gray-400">{globalSettings.gravity.x.toFixed(1)}</span>
                                    </div>
                                    <input type="range" min="-5" max="5" step="0.1" 
                                        value={globalSettings.gravity.x} 
                                        className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-400"
                                        onChange={(e) => setGlobalSettings(prev => ({ ...prev, gravity: { ...prev.gravity, x: parseFloat(e.target.value) } }))}
                                    />
                                 </div>

                                 <div className="h-px bg-gray-100 my-4" />

                                 {/* Time Scale */}
                                 <div>
                                    <div className="flex justify-between text-xs font-medium text-gray-600 mb-2">
                                        <span>时间流速 (Time Scale)</span>
                                        <span className="bg-white px-2 py-0.5 rounded shadow-sm text-gray-400">{globalSettings.timeScale.toFixed(2)}x</span>
                                    </div>
                                    <input type="range" min="0.1" max="3" step="0.1" 
                                        value={globalSettings.timeScale} 
                                        className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                        onChange={(e) => setGlobalSettings(prev => ({ ...prev, timeScale: parseFloat(e.target.value) }))}
                                    />
                                    <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                                        <span>慢动作</span>
                                        <span>快进</span>
                                    </div>
                                 </div>

                                 {/* Air Resistance */}
                                 <div>
                                    <div className="flex justify-between text-xs font-medium text-gray-600 mb-2">
                                        <span>空气阻力 (Air Resistance)</span>
                                        <span className="bg-white px-2 py-0.5 rounded shadow-sm text-gray-400">{globalSettings.airResistance}</span>
                                    </div>
                                    <input type="range" min="0" max="0.1" step="0.001" 
                                        value={globalSettings.airResistance} 
                                        className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-teal-600"
                                        onChange={(e) => setGlobalSettings(prev => ({ ...prev, airResistance: parseFloat(e.target.value) }))}
                                    />
                                 </div>

                                 <div className="h-px bg-gray-100 my-4" />

                                 {/* Default Placement */}
                                 <div>
                                    <div className="flex justify-between text-xs font-medium text-gray-600 mb-2">
                                        <span>{viewMode === 'side' ? '默认深度 (Z)' : '默认高度 (Y)'}</span>
                                        <span className="bg-white px-2 py-0.5 rounded shadow-sm text-gray-400">
                                            {Math.round(viewMode === 'side' ? defaultPlacementZ : defaultPlacementY)}
                                        </span>
                                    </div>
                                    <input type="range" min="-500" max="500" step="10" 
                                        value={viewMode === 'side' ? defaultPlacementZ : defaultPlacementY} 
                                        className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                                        onChange={(e) => { 
                                            const val = parseInt(e.target.value);
                                            if (viewMode === 'side') setDefaultPlacementZ(val);
                                            else setDefaultPlacementY(val);
                                        }}
                                    />
                                 </div>
                             </div>
                        </div>
                    );
                }
            })()}
            
            {showGraphPanel && (
                <div className="mt-4 pb-4">
                     <GraphPanel 
                        data={graphData} 
                        onClose={() => setShowGraphPanel(false)} 
                        objectNames={objects.reduce((acc, obj) => { 
                            const sceneObj = builder.sceneData[obj.plugin.userLabel];
                            // Filter out static objects (Ground, Wall, etc.) from graph legend
                            if (sceneObj && !sceneObj.isStatic) {
                                acc[obj.plugin.userLabel] = sceneObj.name || obj.plugin.userLabel; 
                            }
                            return acc; 
                        }, {})}
                    />
                </div>
            )}
        </div>


      </div>
    </div>
  );
};

const MiniMap = ({ data, viewMode, indicatorValue, width, height }) => {
    const worldW = window.innerWidth - 384;
    const worldH = window.innerHeight;
    const scaleX = width / worldW;
    const scaleY = height / worldH;
    const mappedIndicatorY = (worldH / 2) - indicatorValue;

    return (
        <div style={{ width, height }} className="relative bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
             <div className="absolute inset-0 opacity-20" 
                  style={{ backgroundImage: 'linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
             </div>

            {Object.values(data).map(obj => {
                let x, y, w, h, borderRadius = 0;
                if (viewMode === 'top') {
                    x = obj.x * scaleX;
                    y = obj.z * scaleY;
                    w = obj.width * scaleX;
                    h = obj.depth * scaleY;
                } else {
                    x = obj.x * scaleX;
                    y = obj.y * scaleY;
                    w = obj.width * scaleX;
                    h = obj.height * scaleY;
                }
                if (obj.type === 'Circle' || (obj.type === 'Cone' && viewMode === 'top')) {
                    borderRadius = '50%';
                }
                return (
                    <div key={obj.id} 
                        className="absolute bg-blue-500/50 border border-blue-400/50"
                        style={{ left: x - w/2, top: y - h/2, width: w, height: h, borderRadius }}
                    />
                );
            })}
            
            <div className="absolute left-0 right-0 border-t-2 border-dashed border-yellow-400 z-10 shadow-[0_0_10px_rgba(250,204,21,0.5)]" style={{ top: mappedIndicatorY * scaleY }}>
                 <div className="absolute right-0 -top-3 text-[8px] text-yellow-400 font-bold bg-gray-900 px-1 rounded">REF</div>
            </div>
        </div>
    );
};

export default PhysicsEditor;