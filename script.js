document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('drawing-canvas');
    const ctx = canvas.getContext('2d');
    const webcamFeed = document.getElementById('webcam-feed');
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const clearBtn = document.getElementById('clear-btn');
    const colors = document.querySelectorAll('.color');
    const socket = io();

    // Undo/redo stacks
    const undoStack = [];
    const redoStack = [];
    const MAX_STACK_SIZE = 20;

    // Function to capture current canvas state
    function captureState() {
        if (undoStack.length >= MAX_STACK_SIZE) {
            undoStack.shift();
        }
        undoStack.push(canvas.toDataURL());
        redoStack.length = 0; // Clear redo stack when new action is performed
    }

    // Initialize canvas
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';

    // Start/Stop functionality
    startBtn.addEventListener('click', () => {
        webcamFeed.src = "/video_feed";
        socket.emit('start_cam');
    });

    stopBtn.addEventListener('click', () => {
        webcamFeed.src = "";
        socket.emit('stop_cam');
        // Clear the canvas when stopping
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    });

    // Handle clear button
    clearBtn.addEventListener('click', () => {
        socket.emit('clear_canvas');
    });

    // Handle color selection
    colors.forEach(color => {
        color.addEventListener('click', () => {
            const rgb = color.getAttribute('data-color');
            socket.emit('change_color', { color: rgb });
        });
    });

    // Receive drawing data from server
    socket.on('draw', (data) => {
        captureState();
        const { x1, y1, x2, y2, color, thickness } = data;
        ctx.strokeStyle = `rgb(${color})`;
        ctx.lineWidth = thickness === 50 ? 20 : 5; // Thicker for eraser
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    });

    // Add color palette header
    const header = document.createElement('div');
    header.className = 'color-header';
    header.innerHTML = `
        <div class="color red" data-color="255,0,0"></div>
        <div class="color green" data-color="0,255,0"></div>
        <div class="color blue" data-color="0,0,255"></div>
        <div class="color yellow" data-color="255,255,0"></div>
        <div class="color purple" data-color="128,0,128"></div>
        <div class="color black" data-color="0,0,0"></div>
    `;
    document.querySelector('.webcam-container').prepend(header);

    // Handle canvas cleared event
    socket.on('canvas_cleared', () => {
        captureState();
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    });

    // Undo button handler
    document.getElementById('undo-btn').addEventListener('click', () => {
        if (undoStack.length > 0) {
            const state = undoStack.pop();
            redoStack.push(canvas.toDataURL());

            const img = new Image();
            img.onload = function() {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
            };
            img.src = state;
        }
    });

    // Redo button handler
    document.getElementById('redo-btn').addEventListener('click', () => {
        if (redoStack.length > 0) {
            const state = redoStack.pop();
            undoStack.push(canvas.toDataURL());

            const img = new Image();
            img.onload = function() {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
            };
            img.src = state;
        }
    });

    // Enhanced save drawing functionality
    document.getElementById('save-btn').addEventListener('click', () => {
        // Prompt user for filename
        const filename = prompt('Enter a name for your drawing (or leave blank for auto-name):', '');

        // Get canvas data
        const dataURL = canvas.toDataURL('image/png');

        // Save to local storage
        localStorage.setItem('savedDrawing', dataURL);

        // Save to server
        canvas.toBlob((blob) => {
            const formData = new FormData();
            const saveName = filename ? `${filename}.png` : 'drawing.png';
            formData.append('file', blob, saveName);

            fetch('/save_drawing', {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    alert(`Drawing saved as: ${data.filename}`);
                } else {
                    alert('Error saving to server, but saved to local storage');
                }
            })
            .catch(error => {
                console.error('Save error:', error);
                alert('Error saving drawing');
            });
        }, 'image/png', 0.95); // 0.95 quality for PNG
    });

    // Load drawing - try local storage first, then server
    document.getElementById('load-btn').addEventListener('click', () => {
        // First check local storage
        const savedDataURL = localStorage.getItem('savedDrawing');
        if (savedDataURL) {
            const img = new Image();
            img.onload = function() {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
                alert('Loaded from local storage');
            };
            img.src = savedDataURL;
        } else {
            // Fall back to server if nothing in local storage
            fetch('/list_drawings')
            .then(response => response.json())
            .then(files => {
                if (files.length > 0) {
                    const latest = files[0];
                    const img = new Image();
                    img.onload = function() {
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                        ctx.drawImage(img, 0, 0);
                        alert(`Loaded server file: ${latest}`);
                    };
                    img.src = `/load_drawing/${latest}`;
                } else {
                    alert('No saved drawings found');
                }
            });
        }
    });

    // Handle file upload
    document.getElementById('file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(event) {
                const img = new Image();
                img.onload = function() {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0);
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
    });

    // Trigger file input when load button is clicked
    document.getElementById('load-btn').addEventListener('click', () => {
        document.getElementById('file-input').click();
    });

    // Navigation between sections
    const navHome = document.getElementById('nav-home');
    const navHomeLink = document.getElementById('nav-home-link');
    const navRegisterLink = document.getElementById('nav-register-link');
    const navLoginLink = document.getElementById('nav-login-link');
    const navHelpLink = document.getElementById('nav-help-link');
    const navLogoutLink = document.getElementById('nav-logout-link');

    const homeSection = document.getElementById('home-section');
    const registerSection = document.getElementById('register-section');
    const loginSection = document.getElementById('login-section');
    const helpSection = document.getElementById('help-section');
    const paintingSection = document.getElementById('painting-section');

    function hideAllSections() {
        homeSection.style.display = 'none';
        registerSection.style.display = 'none';
        loginSection.style.display = 'none';
        helpSection.style.display = 'none';
        paintingSection.style.display = 'none';
    }

    function setActiveNav(link) {
        [navHomeLink, navRegisterLink, navLoginLink, navHelpLink].forEach(l => l.classList.remove('active'));
        if (link) {
            link.classList.add('active');
        }
    }

    navHome.addEventListener('click', (e) => {
        e.preventDefault();
        hideAllSections();
        homeSection.style.display = 'block';
        setActiveNav(navHomeLink);
    });

    navHomeLink.addEventListener('click', (e) => {
        e.preventDefault();
        hideAllSections();
        homeSection.style.display = 'block';
        setActiveNav(navHomeLink);
    });

    navRegisterLink.addEventListener('click', (e) => {
        e.preventDefault();
        hideAllSections();
        registerSection.style.display = 'block';
        setActiveNav(navRegisterLink);
    });

    navLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        hideAllSections();
        loginSection.style.display = 'block';
        setActiveNav(navLoginLink);
    });

    navHelpLink.addEventListener('click', (e) => {
        e.preventDefault();
        hideAllSections();
        helpSection.style.display = 'block';
        setActiveNav(navHelpLink);
    });

    navLogoutLink.addEventListener('click', (e) => {
        e.preventDefault();
        fetch('/logout')
            .then(() => {
                alert('Logged out successfully');
                hideAllSections();
                loginSection.style.display = 'block';
                setActiveNav(navLoginLink);
            });
    });

    // Function to show section based on hash
    function showSectionFromHash() {
        const hash = window.location.hash;
        hideAllSections();
        switch (hash) {
            case '#register-section':
                registerSection.style.display = 'block';
                setActiveNav(navRegisterLink);
                break;
            case '#login-section':
                loginSection.style.display = 'block';
                setActiveNav(navLoginLink);
                break;
            case '#help-section':
                helpSection.style.display = 'block';
                setActiveNav(navHelpLink);
                break;
            case '#painting-section':
                paintingSection.style.display = 'block';
                // No nav link for painting section, so clear active nav
                setActiveNav(null);
                break;
            default:
                homeSection.style.display = 'block';
                setActiveNav(navHomeLink);
                break;
        }
    }

    // Call on page load
    showSectionFromHash();

    // Listen for hash changes
    window.addEventListener('hashchange', showSectionFromHash);

});
