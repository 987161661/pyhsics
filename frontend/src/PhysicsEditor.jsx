import React, { useState, useEffect, useRef } from 'react';
import Matter from 'matter-js';
import { Stage, Layer, Rect, Circle, Line, Group } from 'react-konva';
import { 
  Play, Pause, RotateCcw, Square, Circle as CircleIcon, MousePointer, 
  Move, Settings, Box, Link, ArrowRight, Triangle, ArrowDown, Minus, 
  ChevronDown, ChevronRight, Hexagon, FastForward, RotateCw, Maximize, 
  Activity, Cone, Grid, Layers, Monitor, Scissors, Save, Upload, Undo2, Redo2, Anchor,
  Tent, Disc
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
const ZigzagLine = ({ points, stroke, strokeWidth, ...props }) => {
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
                
                const coils = 10;
                const amp = 8;
                const step = dist / coils;
                
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
  const [defaultPlacementZ, setDefaultPlacementZ] = useState(0);
  const [defaultPlacementY, setDefaultPlacementY] = useState(0);
  const [isAdjustingGlobal, setIsAdjustingGlobal] = useState(false);
  const [connectionStart, setConnectionStart] = useState(null); 
  const [cutStart, setCutStart] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [snapLines, setSnapLines] = useState([]);
  const stageRef = useRef(null);
  const renderRef = useRef(null);
  const dragRef = useRef({ activeId: null, startX: 0, startY: 0, startAngle: 0, startWidth: 0, startHeight: 0, startRadius: 0 });

  const GRID_SIZE = 50;
  const snap = (val) => snapToGrid ? Math.round(val / GRID_SIZE) * GRID_SIZE : val;

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

  // Loop
  useEffect(() => {
    const runner = () => {
      if (isRunning) {
        Matter.Engine.update(engine, 1000 / 60);
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
      if (pointer && tool === 'cut') {
          setCutStart(pointer);
      }
      // Also handle deselection if clicking empty space
      if (e.target === stage && tool === 'select') {
          setSelectedId(null);
      }
  };

  const handleStageMouseMove = (e) => {
      const stage = e.target.getStage();
      const pointer = stage.getRelativePointerPosition();
      if (pointer) {
          setMousePos(pointer);
          
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
                  builder.updateObject(activeId, { angle: startAngle + angleChange });
              } else if (tool === 'scale') {
                  const scaleFactor = Math.max(0.1, 1 + (dx / 100));
                  if (startRadius) {
                      builder.updateObject(activeId, { radius: startRadius * scaleFactor });
                  } else {
                      builder.updateObject(activeId, { width: startWidth * scaleFactor, height: startHeight * scaleFactor });
                  }
              }
              setVersion(v => v + 1);
          }
      }
  };

  const handleStageMouseUp = () => {
      dragRef.current.activeId = null;
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
  };

  const handleObjectMouseDown = (e, objId) => {
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
          }
      }
  };

  const handleStageClick = (e) => {
    const isCreationTool = ['rect', 'circle', 'ground', 'wall', 'ramp', 'polygon', 'conveyor', 'rope', 'spring', 'cone', 'trapezoid', 'capsule'].includes(tool);
    if (!isCreationTool && e.target !== e.target.getStage()) return;  

    const stage = e.target.getStage();
    const pointer = stage.getRelativePointerPosition();
    if (!pointer) return;

    const id = Date.now().toString();

    // Determine default dimensions for snapping
    let defaultW = 50;
    let defaultH = 50;
    if (tool === 'ground') { defaultW = 200; defaultH = 20; }
    else if (tool === 'wall') { defaultW = 20; defaultH = 200; }
    else if (tool === 'ramp') { defaultW = 100; defaultH = 100; }
    else if (tool === 'conveyor') { defaultW = 150; defaultH = 20; }
    else if (tool === 'polygon') { defaultW = 60; defaultH = 60; }
    else if (tool === 'circle' || tool === 'cone') { defaultW = 50; defaultH = 50; }
    else if (tool === 'trapezoid') { defaultW = 80; defaultH = 50; }
    else if (tool === 'capsule') { defaultW = 50; defaultH = 100; }

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
    if (!builder.isRegionFree(x, y, defaultW, defaultH)) {
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

    if (tool === 'rope' || tool === 'spring' || tool === 'pulley') {
        if (!connectionStart) {
            setConnectionStart({ type: 'point', x: finalX, y: finalY, z: finalZ, viewX: x, viewY: y });
        } else {
            const startX = connectionStart.x;
            const startY = connectionStart.y;
            const startZ = connectionStart.z;
            const dist = Math.sqrt(Math.pow(finalX - startX, 2) + Math.pow(finalY - startY, 2) + Math.pow(finalZ - startZ, 2));

            let bodyAId = null, pointA = null;
            if (connectionStart.type === 'body') {
                bodyAId = connectionStart.id;
                pointA = { x: 0, y: 0 }; 
            } else {
                pointA = viewMode === 'side' ? { x: connectionStart.x, y: connectionStart.y } : { x: connectionStart.x, y: connectionStart.z };
            }

            let bodyBId = null, pointB = viewMode === 'side' ? { x: finalX, y: finalY } : { x: finalX, y: finalZ };

            if (tool === 'rope') {
                builder.createIdealRope(id, { bodyAId, bodyBId, pointA, pointB, length: dist || 100 });
            } else if (tool === 'spring') {
                builder.createSpring(id, { bodyAId, bodyBId, pointA, pointB, length: dist || 100, stiffness: 0.01, damping: 0.1 });
            } else if (tool === 'pulley') {
                 // Create default pulley points above the objects
                 // In side view, Y is up/down. -200 is up.
                 const pC = { x: startX, y: startY - 150, z: startZ };
                 const pD = { x: finalX, y: finalY - 150, z: finalZ };
                 
                 // If top view, we can't easily visualize height difference for pulleys unless we assume Z.
                 // But let's just use the calculated world coords.
                 builder.createPulley(id, { 
                    bodyAId, bodyBId, 
                    pointA, pointB, 
                    pointC: pC, pointD: pD 
                 });
            }
            
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
       builder.createBlock(id, { x: finalX, y: finalY, z: finalZ, width: 200, height: 20, depth: 200, isStatic: true, color: '#2c3e50', label: 'Ground' });
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
            <ToolButton icon={<RotateCw />} active={tool === 'rotate'} onClick={() => setTool('rotate')} tooltip="旋转" />
            <ToolButton icon={<Maximize />} active={tool === 'scale'} onClick={() => setTool('scale')} tooltip="缩放" />
            <ToolButton icon={<Scissors />} active={tool === 'cut'} onClick={() => setTool('cut')} tooltip="切割" />
        </CollapsibleSection>
        
        <CollapsibleSection title="刚体对象">
            <ToolButton icon={<Square />} active={tool === 'rect'} onClick={() => setTool('rect')} tooltip="矩形" />
            <ToolButton icon={<CircleIcon />} active={tool === 'circle'} onClick={() => setTool('circle')} tooltip="圆形" />
            <ToolButton icon={<Cone />} active={tool === 'cone'} onClick={() => setTool('cone')} tooltip="圆锥" />
            <ToolButton icon={<Hexagon />} active={tool === 'polygon'} onClick={() => setTool('polygon')} tooltip="多边形" />
            <ToolButton icon={<Tent />} active={tool === 'trapezoid'} onClick={() => setTool('trapezoid')} tooltip="梯形" />
            <ToolButton icon={<Disc />} active={tool === 'capsule'} onClick={() => setTool('capsule')} tooltip="胶囊" />
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
                return <Line {...props} />;
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

            {/* Snap Lines */}
            {snapLines.map((line, i) => (
                <Line key={`snap-${i}`} points={line} stroke="#f59e0b" strokeWidth={1} dash={[4, 4]} />
            ))}

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
              .map((obj) => {
              if (obj.visible === false) return null;
              const data = builder.sceneData[obj.plugin.userLabel];
              return (
              <Group 
                key={obj.id} 
                x={obj.x} y={obj.y} 
                rotation={obj.angle * (180 / Math.PI)}
                draggable={tool === 'select'}
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
                onMouseDown={(e) => handleObjectMouseDown(e, obj.plugin.userLabel)}
                onClick={(e) => {
                    if (tool === 'select') {
                        setSelectedId(obj.plugin.userLabel);
                        e.cancelBubble = true;
                    }
                    if (tool === 'rope' || tool === 'spring') {
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
                             else builder.createSpring(Date.now().toString(), { bodyAId, bodyBId, pointA, pointB, length: dist || 100, stiffness: 0.01, damping: 0.1 });
                             
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
                  <Circle radius={obj.radius} fill={obj.fillStyle || '#ef4444'} stroke="rgba(0,0,0,0.2)" strokeWidth={1} 
                     shadowColor="black" shadowBlur={5} shadowOpacity={0.1} shadowOffset={{x:2,y:2}}
                  />
                )}
                {['Triangle', 'Incline', 'Polygon', 'Cone', 'Trapezoid', 'Capsule'].includes(obj.type) && !(obj.type === 'Cone' && viewMode === 'top') && (
                  <Line points={obj.vertices.flatMap(v => [v.x, v.y])} closed={true} fill={obj.fillStyle || '#e67e22'} stroke="rgba(0,0,0,0.2)" strokeWidth={1} 
                     shadowColor="black" shadowBlur={5} shadowOpacity={0.1} shadowOffset={{x:2,y:2}}
                  />
                )}
              </Group>
            );})}
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
             </div>
        </div>

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
                            {/* Position Group */}
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">变换 (Transform)</label>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="space-y-1">
                                        <span className="text-[10px] text-gray-400">X轴</span>
                                        <input type="number" value={data.x} className="w-full bg-gray-50 border-none rounded-lg text-sm font-mono p-2 focus:ring-2 focus:ring-blue-500 transition-all"
                                            onChange={(e) => { builder.updateObject(selectedId, { x: parseFloat(e.target.value) }); setVersion(v=>v+1); }}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-[10px] text-gray-400">Y轴</span>
                                        <input type="number" value={data.y} className="w-full bg-gray-50 border-none rounded-lg text-sm font-mono p-2 focus:ring-2 focus:ring-blue-500 transition-all"
                                            onChange={(e) => { builder.updateObject(selectedId, { y: parseFloat(e.target.value) }); setVersion(v=>v+1); }}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-[10px] text-gray-400">Z轴</span>
                                        <input type="number" value={data.z} className="w-full bg-gray-50 border-none rounded-lg text-sm font-mono p-2 focus:ring-2 focus:ring-blue-500 transition-all"
                                            onChange={(e) => { builder.updateObject(selectedId, { z: parseFloat(e.target.value) }); setVersion(v=>v+1); }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Dimensions */}
                            <div className="grid grid-cols-2 gap-3">
                                {data.width !== undefined && (
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">宽度</label>
                                        <input type="number" value={data.width} className="w-full bg-gray-50 border-none rounded-lg text-sm p-2 focus:ring-2 focus:ring-blue-500"
                                            onChange={(e) => { builder.updateObject(selectedId, { width: parseFloat(e.target.value) }); setVersion(v=>v+1); }}
                                        />
                                    </div>
                                )}
                                {data.height !== undefined && (
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">高度</label>
                                        <input type="number" value={data.height} className="w-full bg-gray-50 border-none rounded-lg text-sm p-2 focus:ring-2 focus:ring-blue-500"
                                            onChange={(e) => { builder.updateObject(selectedId, { height: parseFloat(e.target.value) }); setVersion(v=>v+1); }}
                                        />
                                    </div>
                                )}
                                {data.radius !== undefined && (
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">半径</label>
                                        <input type="number" value={data.radius} className="w-full bg-gray-50 border-none rounded-lg text-sm p-2 focus:ring-2 focus:ring-blue-500"
                                            onChange={(e) => { builder.updateObject(selectedId, { radius: parseFloat(e.target.value) }); setVersion(v=>v+1); }}
                                        />
                                    </div>
                                )}
                            </div>
                            
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
                                        <input type="number" value={data.stiffness} step="0.01" className="w-full bg-gray-50 border-none rounded-lg text-sm p-2 focus:ring-2 focus:ring-blue-500"
                                            onChange={(e) => { builder.updateObject(selectedId, { stiffness: parseFloat(e.target.value) }); setVersion(v=>v+1); }}
                                        />
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
                            </div>
                        </div>
                    );
                } else {
                    return (
                        <div className="flex flex-col items-center justify-center h-64 text-gray-300 border-2 border-dashed border-gray-100 rounded-3xl">
                            <MousePointer size={48} className="mb-4 opacity-50" />
                            <p className="font-medium text-gray-400">未选中对象</p>
                            <p className="text-xs mt-1 text-gray-300">选中一个物体或连接以编辑属性</p>
                        </div>
                    );
                }
            })()}
        </div>

        {/* Global Settings Footer */}
        <div className="p-6 bg-gray-50 border-t border-gray-100">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase mb-4 tracking-wider flex items-center gap-2">
            <Settings size={12} /> 全局设置
          </h3>
          
          <div className="space-y-5">
             {/* Gravity */}
             <div>
                <div className="flex justify-between text-xs font-medium text-gray-600 mb-2">
                    <span>重力 (Y)</span>
                    <span className="bg-white px-2 py-0.5 rounded shadow-sm text-gray-400">{engine.world.gravity.y.toFixed(1)}</span>
                </div>
                <input type="range" min="0" max="20" step="0.5" value={engine.world.gravity.y} 
                    className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    onChange={(e) => { engine.world.gravity.y = parseFloat(e.target.value); setVersion(v=>v+1); }}
                />
             </div>

             {/* Default Placement */}
             <div className="relative group"
                  onMouseDown={() => setIsAdjustingGlobal(true)}
                  onMouseUp={() => setIsAdjustingGlobal(false)}
                  onMouseLeave={() => setIsAdjustingGlobal(false)}
             >
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
                if (obj.type === 'Circle' || obj.type === 'Cone') {
                    w = (obj.radius * 2) * scaleX;
                    h = (obj.radius * 2) * scaleY;
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