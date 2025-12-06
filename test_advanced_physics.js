const PhysicsSceneBuilder = require('./physics_engine');
const Matter = require('matter-js');

console.log("=== 物理引擎高级组件测试 (滑轮、理想绳、传送带) ===\n");

const scene = new PhysicsSceneBuilder('test-canvas', 800, 600);
const Engine = Matter.Engine;
const totalFrames = 180; // 3秒
const timeStep = 1000 / 60;

// ------------------------------
// 1. 测试理想滑轮 (Ideal Pulley)
// ------------------------------
// 场景：物体 A (2kg) 和 物体 B (1kg) 通过滑轮连接
// 预期：A 下降，B 上升 (因为 Ma > Mb)
console.log("--- 测试 1: 滑轮系统 ---");

const pulleyConfig = {
    setup: { gravity: { x: 0, y: 1 } },
    objects: [
        { id: 'mass_A', type: 'block', params: { x: 200, y: 300, width: 40, height: 40, mass: 2, color: 'red' } }, // 重
        { id: 'mass_B', type: 'block', params: { x: 600, y: 300, width: 40, height: 40, mass: 1, color: 'blue' } } // 轻
    ],
    constraints: [
        {
            id: 'main_pulley',
            type: 'ideal_pulley',
            params: {
                x: 400, y: 50, // 滑轮在上方
                radius: 20,
                bodyAId: 'mass_A',
                bodyBId: 'mass_B',
                length: 600 // 绳长
            }
        }
    ]
};

scene.buildFromJSON(pulleyConfig);
const massA = scene.entities['mass_A'];
const massB = scene.entities['mass_B'];

console.log(`初始高度: A=${massA.position.y.toFixed(2)}, B=${massB.position.y.toFixed(2)}`);

for (let i = 0; i < 60; i++) { Engine.update(scene.engine, timeStep); } // 运行1秒

console.log(`1秒后:   A=${massA.position.y.toFixed(2)}, B=${massB.position.y.toFixed(2)}`);
if (massA.position.y > 300 && massB.position.y < 300) {
    console.log("[SUCCESS] 重物 A 下降，轻物 B 上升");
} else {
    console.log("[FAIL] 滑轮逻辑异常");
}

// ------------------------------
// 2. 测试理想绳 (松弛特性)
// ------------------------------
console.log("\n--- 测试 2: 理想绳索 (松弛) ---");
scene.clear();

// 场景：物体 C 自由落体，绳子长度很长，一开始应该松弛，直到达到长度
const ropeConfig = {
    setup: { gravity: { x: 0, y: 1 } },
    objects: [
        { id: 'mass_C', type: 'block', params: { x: 400, y: 100, width: 40, height: 40, mass: 1 } }
    ],
    constraints: [
        {
            id: 'loose_rope',
            type: 'ideal_rope',
            params: {
                bodyAId: 'mass_C',
                pointB: { x: 400, y: 0 }, // 挂在天花板
                length: 300 // 绳长300，初始距离100，所以松弛
            }
        }
    ]
};

scene.buildFromJSON(ropeConfig);
const massC = scene.entities['mass_C'];

// 运行前几帧，物体应该自由下落 (重力加速度)
for (let i = 0; i < 30; i++) { Engine.update(scene.engine, timeStep); }
const velY_free = massC.velocity.y;
console.log(`0.5秒后速度 (自由下落): ${velY_free.toFixed(2)}`);

// 继续运行直到绳子绷紧 (y > 300)
let isTaut = false;
for (let i = 0; i < 200; i++) { 
    Engine.update(scene.engine, timeStep);
    if (massC.position.y >= 300 && !isTaut) {
        console.log(`绳子在 T=${(i+30)*timeStep/1000}s 绷紧, Y=${massC.position.y.toFixed(2)}`);
        isTaut = true;
    }
}

// 最终物体应该被拉回或悬挂在 300 附近
console.log(`最终位置: Y=${massC.position.y.toFixed(2)} (目标绳长 300)`);
if (Math.abs(massC.position.y - 300) < 20) { // 允许一定弹性和误差
    console.log("[SUCCESS] 绳索成功拉住物体");
} else {
    console.log("[FAIL] 绳索未生效或断裂");
}

// ------------------------------
// 3. 测试传送带
// ------------------------------
console.log("\n--- 测试 3: 传送带 ---");
scene.clear();

scene.createConveyorBelt('belt', { x: 400, y: 500, width: 600, height: 20, speed: 5 }); // 向右速度 5
scene.createBlock('box', { x: 200, y: 400, width: 40, height: 40, mass: 1, friction: 0.5 }); // 箱子掉落在传送带左侧

const box = scene.entities['box'];

// 运行模拟
for (let i = 0; i < 120; i++) { Engine.update(scene.engine, timeStep); }

console.log(`2秒后箱子速度 X: ${box.velocity.x.toFixed(2)} (目标: 5.00)`);
if (box.velocity.x > 4.0) {
    console.log("[SUCCESS] 箱子被传送带加速");
} else {
    console.log("[FAIL] 传送带未生效");
}
