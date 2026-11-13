import * as THREE from "./vendor/three/three.module.js";

// Create one 3D view and return the functions used by app.js.
export function createArmScene(container) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#eef2f6");

    // Look towards the arm from above and slightly to one side.
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(6, 4.5, 7);
    camera.lookAt(0, 1.8, 0);

    // Limit pixel density to reduce the work on smaller laptops.
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.replaceChildren(renderer.domElement);

    // Light the arm from several directions so its shape is clear.
    const ambientLight = new THREE.HemisphereLight(
        0xffffff,
        0x64748b,
        2
    );
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 2.5);
    mainLight.position.set(4, 7, 5);
    scene.add(mainLight);

    // Use shared materials for the arm, joints and gripper.
    const orangeMaterial = new THREE.MeshStandardMaterial({
        color: 0xf28c28,
        roughness: 0.65
    });

    const darkMaterial = new THREE.MeshStandardMaterial({
        color: 0x263449,
        roughness: 0.75
    });

    const metalMaterial = new THREE.MeshStandardMaterial({
        color: 0xb8c4d2,
        roughness: 0.45,
        metalness: 0.35
    });

    // Add a rectangular part at a position relative to its parent.
    function addBox(parent, width, height, depth, material, x, y, z) {
        const geometry = new THREE.BoxGeometry(width, height, depth);
        const mesh = new THREE.Mesh(geometry, material);

        mesh.position.set(x, y, z);
        parent.add(mesh);
        return mesh;
    }

    // Add a round joint at the centre of a movement group.
    function addJoint(parent, radius) {
        const geometry = new THREE.SphereGeometry(radius, 24, 16);
        const mesh = new THREE.Mesh(geometry, metalMaterial);
        parent.add(mesh);
    }

    // Mark the ground plane and the three world directions.
    const grid = new THREE.GridHelper(10, 20, 0x94a3b8, 0xcbd5e1);
    grid.position.y = -0.01;
    scene.add(grid);

    const axes = new THREE.AxesHelper(3.8);
    scene.add(axes);

    // Draw readable axis labels that always face the camera.
    function addAxisLabel(text, colour, x, y, z) {
        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 128;

        const context = canvas.getContext("2d");

        if (!context) {
            return;
        }

        context.fillStyle = colour;
        context.font = "bold 80px Arial";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(text, 64, 64);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;

        const material = new THREE.SpriteMaterial({
            map: texture,
            depthTest: false
        });

        const label = new THREE.Sprite(material);
        label.position.set(x, y, z);
        label.scale.set(0.45, 0.45, 1);
        scene.add(label);
    }

    addAxisLabel("X", "#b91c1c", 4.1, 0.2, 0);
    addAxisLabel("Y", "#15803d", 0, 4.1, 0);
    addAxisLabel("Z", "#1d4ed8", 0, 0.2, 4.1);

    // Keep the base fixed while the parts above it rotate.
    addBox(scene, 1.4, 0.3, 1.4, darkMaterial, 0, 0.15, 0);

    // Turn the complete upper assembly around the vertical Y axis.
    const yawGroup = new THREE.Group();
    yawGroup.position.y = 0.3;
    scene.add(yawGroup);

    addBox(yawGroup, 0.65, 0.8, 0.65, orangeMaterial, 0, 0.4, 0);

    // Tilt the upper assembly around the shoulder joint.
    const pitchGroup = new THREE.Group();
    pitchGroup.position.y = 0.8;
    yawGroup.add(pitchGroup);

    addJoint(pitchGroup, 0.28);
    addBox(pitchGroup, 0.4, 1.6, 0.4, orangeMaterial, 0, 0.8, 0);

    // Rotate the gripper around the upper arm's local length.
    const rollGroup = new THREE.Group();
    rollGroup.position.y = 1.6;
    pitchGroup.add(rollGroup);

    addJoint(rollGroup, 0.24);
    addBox(rollGroup, 0.7, 0.18, 0.35, darkMaterial, 0, 0.3, 0);

    // Place two fingers above the wrist to make roll easy to see.
    addBox(rollGroup, 0.12, 0.45, 0.18, metalMaterial, -0.29, 0.55, 0);
    addBox(rollGroup, 0.12, 0.45, 0.18, metalMaterial, 0.29, 0.55, 0);

    // Add an orange marker so opposite gripper positions look different.
    addBox(rollGroup, 0.15, 0.12, 0.2, orangeMaterial, 0.29, 0.82, 0);

    // Match the canvas to its container whenever the layout changes.
    function render() {
        const width = container.clientWidth;
        const height = container.clientHeight;

        if (width === 0 || height === 0) {
            return;
        }

        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);
    }

    // Reduce full turns only for rendering; keep the saved yaw unchanged.
    function toRadians(degrees) {
        return THREE.MathUtils.degToRad(degrees % 360);
    }

    // Apply the accepted pose immediately without animation.
    function setPose(pose) {
        yawGroup.rotation.y = toRadians(pose.yaw);
        pitchGroup.rotation.z = toRadians(pose.pitch);
        rollGroup.rotation.y = toRadians(pose.roll);
        render();
    }

    // Redraw only when the container changes size or the pose changes.
    const resizeObserver = new ResizeObserver(render);
    resizeObserver.observe(container);
    render();

    return { setPose, render };
}