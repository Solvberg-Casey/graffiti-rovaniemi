import * as THREE from 'three';

// GSAP доступен глобально

let scene, camera, renderer;
let plane, allBoxes = [];
let arcFocusTarget, circleCenterPoint;
const boxHeight = 2.44, boxWidth = 1.3, boxDepth = 0.32;
const numActualBoxes = 8;
const arcRadius = 48, totalArcAngleDeg = 42, totalArcAngleRad = THREE.MathUtils.degToRad(totalArcAngleDeg);
let currentViewIndex = 0;
const GENERAL_VIEWS_COUNT = 2;
const BOX_FOCUS_VIEWS_START_INDEX = GENERAL_VIEWS_COUNT;
let FINAL_LOOK_VIEW_INDEX;
let BOX_ROTATION_VIEWS_START_INDEX;
let FINAL_FADE_VIEW_INDEX;
let isAnimating = false;
const cameraAnimationDuration = 1.0;
const rotationAnimationDuration = 0.7;
const fadeAnimationDuration = 0.7;
const cameraViews = [];
let animatedLookAtTarget = new THREE.Vector3();
let accumulatedDeltaY = 0;
const SCROLL_THRESHOLD = 200; 
let currentScrollThreshold = SCROLL_THRESHOLD; 
let scrollTimeout = null;
let canProcessScroll = true;
const pageFooterUI = document.getElementById('page-footer');
const navArrowsUI = document.getElementById('nav-arrows');
const textPanelUI = document.getElementById('text-panel');
const prevBoxBtn = document.getElementById('prev-box-btn');
const nextBoxBtn = document.getElementById('next-box-btn');
const homeButton = document.getElementById('home-button');

const textureLoader = new THREE.TextureLoader(); // Создаем один загрузчик текстур

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdddddd);
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5); 
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 80, 40); 
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048; 
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 200; 
    directionalLight.shadow.camera.left = -100; 
    directionalLight.shadow.camera.right = 100;
    directionalLight.shadow.camera.top = 100;
    directionalLight.shadow.camera.bottom = -100;
    scene.add(directionalLight);
    plane = new THREE.Mesh( new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x008000, side: THREE.DoubleSide }) );
    plane.rotation.x = -Math.PI / 2;
    plane.receiveShadow = true;
    scene.add(plane);
    const yOffset = 0.15;
    circleCenterPoint = new THREE.Vector3(0, boxHeight / 2 + yOffset, 0); 
    const boxGeometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth);
    
    // Базовый материал для верха и низа боксов (и для граней, если текстура не загрузится)
    const baseBoxMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xffffff, 
        roughness: 0.7, 
        metalness: 0.1, 
        transparent: true // Для opacity анимации
    });

    for (let i = 0; i < numActualBoxes; i++) {
        const boxMaterials = [
            // Порядок граней: right, left, top, bottom, front, back (+X, -X, +Y, -Y, +Z, -Z)
            new THREE.MeshStandardMaterial({ map: textureLoader.load(`textures/box_${i+1}_right.png`), transparent: true, opacity: 1 }),
            new THREE.MeshStandardMaterial({ map: textureLoader.load(`textures/box_${i+1}_left.png`), transparent: true, opacity: 1 }),
            baseBoxMaterial.clone(), // Верхняя грань - без текстуры
            baseBoxMaterial.clone(), // Нижняя грань - без текстуры
            new THREE.MeshStandardMaterial({ map: textureLoader.load(`textures/box_${i+1}_front.png`), transparent: true, opacity: 1 }),
            new THREE.MeshStandardMaterial({ map: textureLoader.load(`textures/box_${i+1}_back.png`), transparent: true, opacity: 1 })
        ];
        
        // Обработка ошибок загрузки текстур (опционально, но полезно)
        boxMaterials.forEach(mat => {
            if (mat.map) {
                mat.map.onError = () => {
                    console.error(`Не удалось загрузить текстуру для материала:`, mat.map.image.src);
                    // Можно заменить на базовый материал в случае ошибки
                    // mat.map = null; mat.color.set(0xcccccc); mat.needsUpdate = true;
                };
            }
        });

        const box = new THREE.Mesh(boxGeometry, boxMaterials);
        const angle = startAngle + i * angleStep;
        box.position.set( circleCenterPoint.x + arcRadius * Math.sin(angle), circleCenterPoint.y, circleCenterPoint.z + arcRadius * Math.cos(angle) );
        box.castShadow = true; 
        box.userData.id = i + 1; 
        box.userData.initialRotationY = box.rotation.y; 
        scene.add(box); 
        allBoxes.push(box);
    }
    arcFocusTarget = (numActualBoxes > 0) ? new THREE.Vector3( circleCenterPoint.x, boxHeight / 2 + yOffset, circleCenterPoint.z + arcRadius ) : new THREE.Vector3(0, boxHeight / 2 + yOffset, 0);
    
    // --- Определение cameraViews ---
    // View 1, 2
    cameraViews.push({ navLabel: "Домой", viewId: 0, name: "View 1: Top Down", type: "general", position: new THREE.Vector3(arcFocusTarget.x, arcFocusTarget.y + 40, arcFocusTarget.z + 5), lookAt: arcFocusTarget.clone(), fov: 60 });
    cameraViews.push({ navLabel: "Общий вид", viewId: 1, name: "View 2: Arc Front", type: "general", position: new THREE.Vector3(arcFocusTarget.x, 1.6, circleCenterPoint.z + arcRadius + 30), lookAt: arcFocusTarget.clone(), fov: 55 });
    // View 3.x
    const cameraHeightBoxFocus = 1.6, cameraOffsetX = 1.5, cameraOffsetZFromFrontFace = 4.0;
    allBoxes.forEach((box, index) => {
        const boxPos = box.position;
        const targetCameraPosition = new THREE.Vector3(boxPos.x + cameraOffsetX, cameraHeightBoxFocus, (boxPos.z + boxDepth / 2) + cameraOffsetZFromFrontFace);
        const targetLookAtPos = new THREE.Vector3(targetCameraPosition.x, cameraHeightBoxFocus, boxPos.z);
        cameraViews.push({ navLabel: (index === 0) ? "Бокс 1" : null, viewId: BOX_FOCUS_VIEWS_START_INDEX + index, name: `View 3.${index + 1}: Focus Box ${index + 1}`, type: "box_focus", boxIndex: index, position: targetCameraPosition, lookAt: targetLookAtPos, fov: 50 });
    });
    // View 4
    const lastBoxFocusView = cameraViews[BOX_FOCUS_VIEWS_START_INDEX + numActualBoxes - 1];
    const finalCamPos_s = lastBoxFocusView.position.clone(); 
    finalCamPos_s.x += 1.0; 
    finalCamPos_s.y -= 0.3; // ИЗМЕНЕНИЕ по Y
    const finalLookAt_s = lastBoxFocusView.lookAt.clone(); 
    finalLookAt_s.x += 1.0; 
    finalLookAt_s.y -= 0.3; // ИЗМЕНЕНИЕ по Y
    cameraViews.push({ navLabel: "До вращения", viewId: cameraViews.length, name: `View 4: Shifted Look Box ${numActualBoxes}`, type: "final_look", boxIndex: numActualBoxes - 1, position: finalCamPos_s, lookAt: finalLookAt_s, fov: lastBoxFocusView.fov });
    FINAL_LOOK_VIEW_INDEX = cameraViews.length - 1;
    // View 5.x
    BOX_ROTATION_VIEWS_START_INDEX = cameraViews.length;
    const lastBoxForRotation = allBoxes[numActualBoxes - 1];
    const initialRotY = lastBoxForRotation.userData.initialRotationY;
    cameraViews.push({ navLabel: null, viewId: cameraViews.length, name: "View 5.1 (Base for Rotation)", type: "box_rotation", box: lastBoxForRotation, targetRotationY: initialRotY, text: "Бокс готов к вращению.", cameraViewIndexToClone: FINAL_LOOK_VIEW_INDEX });
    cameraViews.push({ navLabel: null, viewId: cameraViews.length, name: "View 5.2 (Rotate +90 deg)", type: "box_rotation", box: lastBoxForRotation, targetRotationY: initialRotY + Math.PI / 2, text: "Бокс повернут на 90° по часовой.", cameraViewIndexToClone: FINAL_LOOK_VIEW_INDEX });
    cameraViews.push({ navLabel: null, viewId: cameraViews.length, name: "View 5.3 (Rotate +180 deg)", type: "box_rotation", box: lastBoxForRotation, targetRotationY: initialRotY + Math.PI, text: "Бокс повернут на 180° по часовой.", cameraViewIndexToClone: FINAL_LOOK_VIEW_INDEX });
    cameraViews.push({ navLabel: null, viewId: cameraViews.length, name: "View 5.4 (Rotate +360 deg)", type: "box_rotation", box: lastBoxForRotation, targetRotationY: initialRotY + 2 * Math.PI, text: "Бокс совершил полный оборот по часовой.", cameraViewIndexToClone: FINAL_LOOK_VIEW_INDEX });
    // View 6
    FINAL_FADE_VIEW_INDEX = cameraViews.length;
    cameraViews.push({ navLabel: "Финал", viewId: cameraViews.length, name: "View 6: Fade Out", type: "final_fade", box: lastBoxForRotation, cameraViewIndexToClone: FINAL_LOOK_VIEW_INDEX });
    
    setupHeaderNavigation();
    if (cameraViews.length > 0) { setCameraToView(0, true); }
    window.addEventListener('resize', onWindowResize, false);
    window.addEventListener('wheel', onMouseWheel, { passive: false });
    if(homeButton) { homeButton.addEventListener('click', (e) => { e.preventDefault(); const targetIndex = parseInt(homeButton.dataset.viewIndex); if (!isAnimating && targetIndex !== currentViewIndex) { setCameraToView(targetIndex, false); } }); }
    prevBoxBtn.addEventListener('click', () => navigateWithButtons(-1));
    nextBoxBtn.addEventListener('click', () => navigateWithButtons(1));
    animate();
}

function setupHeaderNavigation() {
    const navLinksContainer = document.getElementById('header-nav-links-container');
    navLinksContainer.innerHTML = ''; 
    const navPoints = [ { label: "Общий вид", targetViewNameOrIndex: 1 }, { label: "Бокс 1", targetViewNameOrIndex: "View 3.1: Focus Box 1" }, { label: "Вращение", targetViewNameOrIndex: "View 5.1 (Base for Rotation)" }, { label: "Финал", targetViewNameOrIndex: "View 6: Fade Out" } ];
    navPoints.forEach(point => {
        const link = document.createElement('a'); link.href = "#";
        link.classList.add('header-nav-link', 'nav-button-style'); 
        link.textContent = point.label;
        let targetIndex = -1;
        if (typeof point.targetViewNameOrIndex === 'number') { targetIndex = point.targetViewNameOrIndex; } else { targetIndex = cameraViews.findIndex(cv => cv.name === point.targetViewNameOrIndex); }
        if (targetIndex !== -1) { link.dataset.viewIndex = targetIndex; link.addEventListener('click', (e) => { e.preventDefault(); if (!isAnimating && targetIndex !== currentViewIndex) { setCameraToView(targetIndex, false); } }); navLinksContainer.appendChild(link); }
    });
    updateHeaderNavActiveState(currentViewIndex);
}

function updateHeaderNavActiveState(activeIndex) {
    const headerNavElements = document.querySelectorAll('#page-header .header-nav-link'); 
    headerNavElements.forEach(link => {
        link.classList.remove('active'); const linkViewIndex = parseInt(link.dataset.viewIndex);
        if (linkViewIndex === activeIndex) { link.classList.add('active'); return; }
        const activeViewConf = cameraViews[activeIndex];
        if (activeViewConf) {
            if (link.textContent === "Бокс 1" && activeViewConf.type === "box_focus") { link.classList.add('active'); }
            else if (link.textContent === "Вращение" && (activeViewConf.type === "box_rotation" || (activeViewConf.type === "final_look" && activeViewConf.name.startsWith("View 4")) )) { link.classList.add('active'); }
        }
    });
}

// setScrollThreshold УДАЛЕНА

function setCameraToView(viewIndex, instant = false) {
    if (isAnimating && !instant) return; if (viewIndex < 0 || viewIndex >= cameraViews.length) return;
    const targetViewConfig = cameraViews[viewIndex]; isAnimating = true; canProcessScroll = false;
    const prevView = cameraViews[currentViewIndex]; 
    currentViewIndex = viewIndex;
    currentScrollThreshold = SCROLL_THRESHOLD; 
    updateHeaderNavActiveState(currentViewIndex);
    let actualCameraPosition, actualLookAt, actualFov;
    if (targetViewConfig.cameraViewIndexToClone !== undefined) {
        const baseCamView = cameraViews[targetViewConfig.cameraViewIndexToClone];
        actualCameraPosition = baseCamView.position.clone(); actualLookAt = baseCamView.lookAt.clone(); actualFov = baseCamView.fov;
    } else {
        actualCameraPosition = targetViewConfig.position.clone(); actualLookAt = targetViewConfig.lookAt.clone(); actualFov = targetViewConfig.fov;
    }
    handleSceneAndFooterState(targetViewConfig, prevView); 
    const duration = (targetViewConfig.type === "box_rotation" || targetViewConfig.type === "final_fade") ? rotationAnimationDuration : cameraAnimationDuration;
    const tl = gsap.timeline({
        onComplete: () => {
            isAnimating = false;
            if (targetViewConfig.type === "box_rotation") { targetViewConfig.box.rotation.y = targetViewConfig.targetRotationY; }
            if (targetViewConfig.type === "final_fade") { targetViewConfig.box.material.opacity = 0; targetViewConfig.box.visible = false; textPanelUI.style.opacity = 0; textPanelUI.style.display = 'none'; }
            camera.position.copy(actualCameraPosition); animatedLookAtTarget.copy(actualLookAt); camera.lookAt(animatedLookAtTarget); camera.fov = actualFov; camera.updateProjectionMatrix();
            setTimeout(() => { canProcessScroll = true; accumulatedDeltaY = 0; }, 200);
        }
    });
    let cameraNeedsAnimation = true;
    if (targetViewConfig.type === "box_rotation" || targetViewConfig.type === "final_fade") {
        if (camera.position.distanceTo(actualCameraPosition) < 0.01 && camera.fov === actualFov && animatedLookAtTarget.distanceTo(actualLookAt) < 0.01) { cameraNeedsAnimation = false; }
    }
    if (cameraNeedsAnimation) {
        tl.to(camera.position, { ...actualCameraPosition, duration: duration, ease: 'power2.inOut', onUpdate: () => camera.lookAt(animatedLookAtTarget) }, 0);
        tl.to(animatedLookAtTarget, { ...actualLookAt, duration: duration, ease: 'power2.inOut' }, 0);
        tl.to(camera, { fov: actualFov, duration: duration, ease: 'power2.inOut', onUpdate: () => camera.updateProjectionMatrix() }, 0);
    } else { animatedLookAtTarget.copy(actualLookAt); camera.lookAt(animatedLookAtTarget); }
    if (targetViewConfig.type === "box_rotation") { tl.to(targetViewConfig.box.rotation, { y: targetViewConfig.targetRotationY, duration: rotationAnimationDuration, ease: 'power1.inOut' }, cameraNeedsAnimation ? ">-0.1" : 0); }
    if (targetViewConfig.type === "final_fade") { 
        // Анимация материалов бокса (если их несколько)
        if (Array.isArray(targetViewConfig.box.material)) {
            targetViewConfig.box.material.forEach(mat => {
                tl.to(mat, { opacity: 0, duration: fadeAnimationDuration, ease: 'power1.inOut' }, cameraNeedsAnimation ? ">-0.1" : 0);
            });
        } else {
            tl.to(targetViewConfig.box.material, { opacity: 0, duration: fadeAnimationDuration, ease: 'power1.inOut' }, cameraNeedsAnimation ? ">-0.1" : 0);
        }
        tl.to(textPanelUI, { opacity: 0, duration: fadeAnimationDuration, ease: 'power1.inOut' }, cameraNeedsAnimation ? ">-0.1" : 0); 
    }
    updateUIForView(viewIndex);
}

function handleSceneAndFooterState(targetView, prevView) {
    const targetType = targetView.type;
    const prevType = prevView ? prevView.type : null; 
    if (targetType === "final_fade") { pageFooterUI.style.height = '92vh'; }
    else if (targetType === "final_look" || targetType === "box_rotation") { pageFooterUI.style.height = '13vh'; }
    else { pageFooterUI.style.height = '8vh'; }
    const isRotationActive = (targetType === "box_rotation");
    const isFadeActive = (targetType === "final_fade");
    const isFinalLookActive = (targetType === "final_look");
    const rotatingBox = allBoxes[numActualBoxes - 1]; 
    plane.visible = !(isFinalLookActive || isRotationActive || isFadeActive);
    allBoxes.forEach(b => {
        const isTargetRotatingBox = (b === rotatingBox); // Или b === targetView.box для этапов вращения/фейда

        if (isRotationActive || isFadeActive || isFinalLookActive) { 
            b.visible = isTargetRotatingBox;
            if (isTargetRotatingBox) {
                const currentOpacity = (Array.isArray(b.material) ? b.material[0].opacity : b.material.opacity);
                const newOpacity = (targetType === "final_fade" && isAnimating) ? currentOpacity : 1;
                if (Array.isArray(b.material)) {
                    b.material.forEach(mat => mat.opacity = newOpacity);
                } else {
                    b.material.opacity = newOpacity;
                }
            }
        } else { 
            b.visible = true;
            if (Array.isArray(b.material)) {
                b.material.forEach(mat => mat.opacity = 1);
            } else {
                b.material.opacity = 1;
            }
        }
    });
    if (prevType === "box_rotation" && targetType !== "box_rotation" && targetType !== "final_fade") {
        const boxToReset = prevView && prevView.box ? prevView.box : rotatingBox;
        if (boxToReset) { boxToReset.rotation.y = boxToReset.userData.initialRotationY; }
    }
    if ((prevType === "final_look" || prevType === "final_fade") && (targetType === "general" || targetType === "box_focus")) {
        rotatingBox.rotation.y = rotatingBox.userData.initialRotationY;
    }
    if (targetType === "general") { textPanelUI.style.display = 'none'; }
    else { textPanelUI.style.display = 'block';
        if (targetType !== "final_fade" || (targetType === "final_fade" && !isAnimating)) {
            textPanelUI.style.opacity = 1;
        }
    }
}

function onMouseWheel(event) {
    event.preventDefault(); if (!canProcessScroll || isAnimating) return;
    accumulatedDeltaY += event.deltaY; clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => { if (!isAnimating) accumulatedDeltaY = 0; }, 400); 
    if (accumulatedDeltaY > SCROLL_THRESHOLD) { 
        if (currentViewIndex < cameraViews.length - 1) { setCameraToView(currentViewIndex + 1); clearTimeout(scrollTimeout); accumulatedDeltaY = 0; } 
        else accumulatedDeltaY = 0; 
    } else if (accumulatedDeltaY < -SCROLL_THRESHOLD) { 
        if (currentViewIndex > 0) { setCameraToView(currentViewIndex - 1); clearTimeout(scrollTimeout); accumulatedDeltaY = 0; } 
        else accumulatedDeltaY = 0; 
    }
}

function updateUIForView(viewIndex) {
    if (viewIndex < 0 || viewIndex >= cameraViews.length) return;
    const view = cameraViews[viewIndex];
    if (view.type === "box_focus") {
        navArrowsUI.style.visibility = 'visible'; textPanelUI.innerHTML = `<h2>Бокс №${allBoxes[view.boxIndex].userData.id}</h2><p>Фокус на боксе.</p>`;
        prevBoxBtn.classList.toggle('disabled', view.boxIndex === 0); nextBoxBtn.classList.toggle('disabled', view.boxIndex === allBoxes.length - 1);
    } else if (view.type === "final_look") {
        navArrowsUI.style.visibility = 'hidden'; textPanelUI.innerHTML = `<h2>Бокс №${allBoxes[view.boxIndex].userData.id}</h2><p>Подготовка к вращению.</p>`;
    } else if (view.type === "box_rotation") {
        navArrowsUI.style.visibility = 'hidden'; textPanelUI.innerHTML = `<h2>Бокс №${view.box.userData.id}</h2><p>${view.text}</p>`;
    } else if (view.type === "final_fade") {
        navArrowsUI.style.visibility = 'hidden'; textPanelUI.innerHTML = `<h2>Прощание</h2><p>Вселенная схлопывается...</p>`;
    } else { navArrowsUI.style.visibility = 'hidden'; }
}

function navigateWithButtons(direction) {
    const currentConfig = cameraViews[currentViewIndex];
    if (currentConfig && currentConfig.type === "box_focus") {
        let targetViewIdx = currentViewIndex + direction;
        if (targetViewIdx >= BOX_FOCUS_VIEWS_START_INDEX && targetViewIdx < BOX_FOCUS_VIEWS_START_INDEX + numActualBoxes) { setCameraToView(targetViewIdx); }
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight);
    currentScrollThreshold = SCROLL_THRESHOLD; 
    setupHeaderNavigation(); updateHeaderNavActiveState(currentViewIndex); 
}

function animate() { requestAnimationFrame(animate); renderer.render(scene, camera); }

document.addEventListener('DOMContentLoaded', init);
