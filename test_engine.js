const PhysicsSceneBuilder = require('./physics_engine');
const Matter = require('matter-js');

// 模拟测试环境
console.log("=== 开始物理引擎单元测试 ===\n");

// 1. 初始化引擎
const scene = new PhysicsSceneBuilder('test-canvas', 800, 600);
console.log("[x] 物理场景构建器初始化成功");

// 2. 测试 JSON 场景加载 (模拟 LLM 生成的输出)
const testSceneConfig = {
    setup: {
        gravity: { x: 0, y: 1 } // 标准重力
    },
    objects: [
        {
            type: 'ground',
            params: { height: 50 }
        },
        {
            id: 'block_A',
            type: 'block',
            params: {
                x: 200, y: 100, width: 50, height: 50,
                mass: 2, friction: 0.3, color: 'red'
            }
        },
        {
            id: 'ramp_1',
            type: 'ramp',
            params: {
                x: 500, y: 400, width: 400, height: 20, angle: 30, // 30度斜面
                friction: 0.1
            }
        },
        {
            id: 'ball_B',
            type: 'ball',
            params: {
                x: 500, y: 200, radius: 20,
                mass: 1, restitution: 0.9, color: 'blue'
            }
        }
    ],
    constraints: [
        {
            id: 'spring_1',
            type: 'spring',
            params: {
                bodyAId: 'block_A',
                pointB: { x: 200, y: 0 }, // 悬挂点
                stiffness: 0.05,
                length: 100
            }
        }
    ]
};

console.log("正在加载场景配置...");
try {
    scene.buildFromJSON(testSceneConfig);
    console.log(`[x] 场景加载成功: 包含 ${scene.world.bodies.length} 个刚体, ${scene.world.constraints.length} 个约束`);
} catch (e) {
    console.error("[!] 场景加载失败:", e);
    process.exit(1);
}

// 3. 运行物理模拟 (Headless Mode)
console.log("\n开始运行模拟 (2秒)...");
const Engine = Matter.Engine;
const totalFrames = 120; // 60FPS * 2s
const timeStep = 1000 / 60;

// 记录初始状态
const blockA = scene.entities['block_A'];
const ballB = scene.entities['ball_B'];

console.log(`初始状态 T=0s:`);
console.log(`  Block A: y=${blockA.position.y.toFixed(2)}`);
console.log(`  Ball B : y=${ballB.position.y.toFixed(2)}`);

// 模拟循环
for (let i = 0; i < totalFrames; i++) {
    Engine.update(scene.engine, timeStep);
}

console.log(`\n结束状态 T=2s:`);
console.log(`  Block A: y=${blockA.position.y.toFixed(2)} (预期: 下落并被弹簧拉回)`);
console.log(`  Ball B : y=${ballB.position.y.toFixed(2)} (预期: 落在斜面上并滚落)`);

// 简单验证
if (blockA.position.y > 100 && ballB.position.y > 200) {
    console.log("\n[SUCCESS] 物理模拟逻辑正常运行");
} else {
    console.log("\n[FAIL] 物体位置未按预期变化");
}
