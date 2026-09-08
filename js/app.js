document.addEventListener('DOMContentLoaded', () => {
    
    // --- Navigation Logic (SPA) ---
    const navBtns = document.querySelectorAll('.nav-btn');
    const pages = document.querySelectorAll('.page-section');

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');

            // Update Nav Buttons
            navBtns.forEach(b => {
                b.classList.remove('active', 'text-brand-black');
                b.classList.add('text-gray-400');
            });
            btn.classList.add('active', 'text-brand-black');
            btn.classList.remove('text-gray-400');

            // Update Pages
            pages.forEach(page => {
                page.classList.remove('active');
                page.classList.add('hidden');
            });
            const targetPage = document.getElementById(targetId);
            if (targetPage) {
                targetPage.classList.remove('hidden');
                targetPage.classList.add('active');

                // If navigating to Services, reset any previously expanded card state
                if (targetId === 'page-services') {
                    document.querySelectorAll('#page-services .tilt-card').forEach(c => {
                        c.classList.remove('expanded', 'collapsing', 'opacity-40', 'grayscale');
                        c.parentElement.classList.remove('active');
                    });
                }

                // If navigating to Home, ensure map redraws correctly
                if (targetId === 'page-home' && window.pickupMap) {
                    setTimeout(() => {
                        window.pickupMap.invalidateSize();
                    }, 100);
                    setTimeout(() => {
                        window.pickupMap.invalidateSize();
                    }, 450);
                }

                // If navigating to Profile, ensure cash/weight and saved tags are refreshed
                if (targetId === 'page-profile') {
                    if (typeof updateProfileCashAndWeight === 'function') {
                        updateProfileCashAndWeight();
                    }
                    if (typeof syncProfileSavedAddresses === 'function') {
                        syncProfileSavedAddresses();
                    }
                }
            }
        });
    });

    // --- Interactive Pickup Location Map (Leaflet) ---
    const mapContainer = document.getElementById('pickup-map');
    const addressInput = document.getElementById('address');
    const locateMeBtn = document.getElementById('locate-me-btn');

    if (mapContainer && typeof L !== 'undefined') {
        // Default center: Koramangala / HSR Layout, Bengaluru
        const defaultLat = 12.9352;
        const defaultLng = 77.6245;

        const map = L.map('pickup-map', {
            center: [defaultLat, defaultLng],
            zoom: 15,
            zoomControl: false,
            attributionControl: false
        });
        window.pickupMap = map;

        // Clean, fast OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19
        }).addTo(map);

        // Custom Neo-Brutalist Pin Icon
        const brutalIcon = L.divIcon({
            className: 'brutal-pin-marker',
            iconSize: [36, 36],
            iconAnchor: [18, 36],
            html: `
                <div class="brutal-pin">
                    <i class="fa-solid fa-house"></i>
                </div>
            `
        });

        // Add Draggable Pin Marker
        const marker = L.marker([defaultLat, defaultLng], {
            icon: brutalIcon,
            draggable: true
        }).addTo(map);

        // Reverse Geocode using OpenStreetMap Nominatim
        let geocodeTimeout = null;
        function updateAddressFromLatLng(lat, lng) {
            clearTimeout(geocodeTimeout);
            geocodeTimeout = setTimeout(() => {
                fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`)
                    .then(res => res.json())
                    .then(data => {
                        if (data && data.display_name && addressInput) {
                            const parts = data.display_name.split(', ');
                            addressInput.value = parts.slice(0, 4).join(', ');
                        }
                    })
                    .catch(() => {});
            }, 300);
        }

        // 1. Click on Map to Drop/Move Pin
        map.on('click', (e) => {
            const { lat, lng } = e.latlng;
            marker.setLatLng([lat, lng]);
            map.panTo([lat, lng], { animate: true, duration: 0.3 });
            updateAddressFromLatLng(lat, lng);
            resetSavedTagsActiveState();
        });

        // 2. Drag Pin to Fine-Tune Position
        marker.on('dragend', (e) => {
            const { lat, lng } = e.target.getLatLng();
            map.panTo([lat, lng], { animate: true, duration: 0.3 });
            updateAddressFromLatLng(lat, lng);
            resetSavedTagsActiveState();
        });

        // 3. Current Location "Locate Me" Button
        if (locateMeBtn) {
            locateMeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                locateMeBtn.classList.add('animate-spin');
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                        (pos) => {
                            locateMeBtn.classList.remove('animate-spin');
                            const lat = pos.coords.latitude;
                            const lng = pos.coords.longitude;
                            map.setView([lat, lng], 16);
                            marker.setLatLng([lat, lng]);
                            updateAddressFromLatLng(lat, lng);
                            resetSavedTagsActiveState();
                        },
                        () => {
                            locateMeBtn.classList.remove('animate-spin');
                            // Fallback to default animated pan
                            map.setView([defaultLat, defaultLng], 15);
                            marker.setLatLng([defaultLat, defaultLng]);
                            updateAddressFromLatLng(defaultLat, defaultLng);
                            resetSavedTagsActiveState();
                        },
                        { timeout: 5000 }
                    );
                } else {
                    locateMeBtn.classList.remove('animate-spin');
                }
            });
        }

        // --- Saved Address Tags Interactivity ---
        const savedAddressTags = document.querySelectorAll('.saved-address-tag');
        const savedTagsContainer = document.getElementById('saved-addresses-tags');
        const savePinBtn = document.getElementById('save-pin-btn');
        const savePinBadge = document.getElementById('save-pin-badge');
        const savePinToast = document.getElementById('save-pin-toast');
        const pinBadgeText = document.getElementById('pin-badge-text');
        const pinBadgeIcon = document.getElementById('pin-badge-icon');
        const pinIconInner = document.getElementById('pin-icon-inner');
        let toastTimeout = null;

        function resetSavedTagsActiveState() {
            document.querySelectorAll('.saved-address-tag').forEach(t => {
                t.classList.remove('active', 'bg-brand-yellow');
                t.classList.add('bg-white');
            });
            if (pinBadgeText) pinBadgeText.textContent = 'Save Pin';
            if (pinBadgeIcon) pinBadgeIcon.className = 'fa-solid fa-thumbtack text-[10px]';
        }

        savedAddressTags.forEach(tag => {
            tag.addEventListener('click', () => {
                document.querySelectorAll('.saved-address-tag').forEach(t => {
                    t.classList.remove('active', 'bg-brand-yellow');
                    t.classList.add('bg-white');
                });
                tag.classList.add('active', 'bg-brand-yellow');
                tag.classList.remove('bg-white');

                const lat = parseFloat(tag.dataset.lat);
                const lng = parseFloat(tag.dataset.lng);
                const addr = tag.dataset.address;

                if (!isNaN(lat) && !isNaN(lng)) {
                    marker.setLatLng([lat, lng]);
                    map.flyTo([lat, lng], 16, { duration: 0.8 });
                }
                if (addressInput && addr) {
                    addressInput.value = addr;
                }

                if (pinBadgeText) pinBadgeText.textContent = 'Pinned';
                if (pinBadgeIcon) pinBadgeIcon.className = 'fa-solid fa-location-dot text-[10px]';
            });
        });

        // --- Click on PIN Icon to Save with Animation ---
        function triggerSavePinAnimation() {
            // 1. Pop & bounce left Pin Icon
            if (savePinBtn) {
                savePinBtn.classList.remove('animate-pin-pop');
                void savePinBtn.offsetWidth;
                savePinBtn.classList.add('animate-pin-pop');
            }
            if (pinIconInner) {
                pinIconInner.className = 'fa-solid fa-check text-sm text-brand-black';
                setTimeout(() => {
                    pinIconInner.className = 'fa-solid fa-location-dot text-sm text-brand-black';
                }, 2000);
            }

            // 2. Animate and update Save Pin Badge to "Saved!"
            if (savePinBadge) {
                savePinBadge.classList.remove('animate-save-badge');
                void savePinBadge.offsetWidth;
                savePinBadge.classList.add('animate-save-badge');
            }
            if (pinBadgeText) pinBadgeText.textContent = 'Saved!';
            if (pinBadgeIcon) pinBadgeIcon.className = 'fa-solid fa-check text-[10px]';

            // 3. Celebratory bounce on Leaflet Map Pin Marker
            const markerElem = marker.getElement();
            if (markerElem) {
                markerElem.classList.remove('animate-marker-save');
                void markerElem.offsetWidth;
                markerElem.classList.add('animate-marker-save');
                setTimeout(() => {
                    markerElem.classList.remove('animate-marker-save');
                }, 800);
            }

            // 4. Show Animated Saved Toast
            if (savePinToast) {
                clearTimeout(toastTimeout);
                savePinToast.classList.remove('hidden');
                savePinToast.classList.add('flex', 'animate-save-badge');
                toastTimeout = setTimeout(() => {
                    savePinToast.classList.add('hidden');
                    savePinToast.classList.remove('flex', 'animate-save-badge');
                }, 2400);
            }

            // 5. Update or dynamically add to Saved Address Tags
            const currentAddr = addressInput ? addressInput.value.trim() : 'Pinned Address';
            const currentLatLng = marker.getLatLng();

            let matched = false;
            document.querySelectorAll('.saved-address-tag').forEach(tag => {
                if (tag.dataset.address && currentAddr.toLowerCase().includes(tag.dataset.tag.toLowerCase())) {
                    tag.classList.add('active', 'bg-brand-yellow');
                    tag.classList.remove('bg-white');
                    matched = true;
                }
            });

            if (!matched && savedTagsContainer) {
                let customTag = document.getElementById('custom-saved-tag');
                const shortLabel = currentAddr.split(',')[0].trim() || 'Custom Pin';
                if (!customTag) {
                    customTag = document.createElement('button');
                    customTag.type = 'button';
                    customTag.id = 'custom-saved-tag';
                    customTag.className = 'saved-address-tag active flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 border-brand-black bg-brand-yellow text-brand-black font-black text-xs uppercase shadow-brutal-sm active:translate-y-0.5 transition-all whitespace-nowrap cursor-pointer animate-save-badge';
                    customTag.innerHTML = `<i class="fa-solid fa-bookmark text-xs"></i> <span>${shortLabel}</span>`;
                    customTag.dataset.tag = 'custom';
                    customTag.dataset.lat = currentLatLng.lat;
                    customTag.dataset.lng = currentLatLng.lng;
                    customTag.dataset.address = currentAddr;

                    customTag.addEventListener('click', () => {
                        document.querySelectorAll('.saved-address-tag').forEach(t => {
                            t.classList.remove('active', 'bg-brand-yellow');
                            t.classList.add('bg-white');
                        });
                        customTag.classList.add('active', 'bg-brand-yellow');
                        customTag.classList.remove('bg-white');
                        marker.setLatLng([currentLatLng.lat, currentLatLng.lng]);
                        map.flyTo([currentLatLng.lat, currentLatLng.lng], 16, { duration: 0.8 });
                        if (addressInput) addressInput.value = currentAddr;
                        if (pinBadgeText) pinBadgeText.textContent = 'Pinned';
                    });

                    savedTagsContainer.appendChild(customTag);
                } else {
                    const labelSpan = customTag.querySelector('span');
                    if (labelSpan) labelSpan.textContent = shortLabel;
                    customTag.dataset.lat = currentLatLng.lat;
                    customTag.dataset.lng = currentLatLng.lng;
                    customTag.dataset.address = currentAddr;
                    customTag.classList.add('active', 'bg-brand-yellow');
                    customTag.classList.remove('bg-white');
                }

                // Deselect other tags
                document.querySelectorAll('.saved-address-tag:not(#custom-saved-tag)').forEach(t => {
                    t.classList.remove('active', 'bg-brand-yellow');
                    t.classList.add('bg-white');
                });

                if (typeof syncProfileSavedAddresses === 'function') {
                    syncProfileSavedAddresses();
                }
            }

            // Reset badge text back after 2.5s
            setTimeout(() => {
                if (pinBadgeText && pinBadgeText.textContent === 'Saved!') {
                    pinBadgeText.textContent = 'Save Pin';
                    if (pinBadgeIcon) pinBadgeIcon.className = 'fa-solid fa-thumbtack text-[10px]';
                }
            }, 2500);
        }

        if (savePinBtn) savePinBtn.addEventListener('click', triggerSavePinAnimation);
        if (savePinBadge) savePinBadge.addEventListener('click', triggerSavePinAnimation);
        marker.on('click', triggerSavePinAnimation);

        // Trigger initial size invalidate once DOM settles
        setTimeout(() => {
            map.invalidateSize();
        }, 200);
        setTimeout(() => {
            map.invalidateSize();
        }, 600);
    }

    // --- Waste Type Multi-Selection Logic (Home Page) ---
    const wasteBtns = document.querySelectorAll('.waste-btn');
    const selectedWasteInput = document.getElementById('selected-waste');

    function updateSelectedWasteInput() {
        const activeBtns = Array.from(document.querySelectorAll('.waste-btn.active'));
        const activeTypes = activeBtns.map(b => b.dataset.type);
        if (selectedWasteInput) {
            selectedWasteInput.value = activeTypes.join(' ');
        }
    }

    wasteBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const isActive = btn.classList.contains('active');
            const badge = btn.querySelector('.selected-badge');

            if (isActive) {
                btn.classList.remove(btn.dataset.color, 'active');
                btn.classList.add('bg-white');
                if (badge) {
                    badge.classList.add('hidden');
                    badge.classList.remove('flex');
                }
            } else {
                btn.classList.remove('bg-white');
                btn.classList.add(btn.dataset.color, 'active');
                if (badge) {
                    badge.classList.remove('hidden');
                    badge.classList.add('flex');
                }
            }

            updateSelectedWasteInput();
        });
    });

    // Initialize input with currently active buttons
    updateSelectedWasteInput();

    // --- Booking Flow Simulation ---
    const bookBtn = document.getElementById('book-btn');
    const findingOverlay = document.getElementById('finding-overlay');
    const successOverlay = document.getElementById('success-overlay');
    const finishBtn = document.getElementById('finish-btn');
    const timingBadge = document.getElementById('pickup-timing-badge');
    const timingDesc = document.getElementById('pickup-timing-desc');

    let lastBookingInfo = null;

    bookBtn.addEventListener('click', (e) => {
        e.preventDefault();

        if (!addressInput.value) {
            addressInput.focus();
            return;
        }

        const selectedWasteVal = (selectedWasteInput.value || '').trim();
        if (!selectedWasteVal) {
            // Shake waste types container if no material selected
            const wasteContainer = document.getElementById('waste-types');
            if (wasteContainer) {
                wasteContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
                wasteContainer.classList.add('ring-2', 'ring-red-500', 'rounded-2xl', 'p-1');
                setTimeout(() => {
                    wasteContainer.classList.remove('ring-2', 'ring-red-500', 'rounded-2xl', 'p-1');
                }, 1200);
            }
            return;
        }

        // Determine if pickup is scheduled for Today or Tomorrow (7 PM cutoff)
        const now = new Date();
        const currentHour = now.getHours();
        const isPastSevenPM = currentHour >= 19; // 7 PM in 24h

        let scheduleDay = 'Today';
        let scheduleDateStr = '';
        let displayScheduleTime = '';

        if (!isPastSevenPM) {
            scheduleDay = 'Today';
            scheduleDateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
            displayScheduleTime = 'Today, by 8:00 PM';
            if (timingBadge) timingBadge.innerText = 'Pickup Scheduled for Today';
            if (timingDesc) timingDesc.innerText = 'Raju Bhai will visit with his weighing cart today before 8:00 PM.';
        } else {
            scheduleDay = 'Tomorrow';
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            scheduleDateStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}`;
            displayScheduleTime = 'Tomorrow, 10:00 AM';
            if (timingBadge) timingBadge.innerText = 'Pickup Scheduled for Tomorrow';
            if (timingDesc) timingDesc.innerText = 'Booked past 7:00 PM. Raju Bhai will visit with his weighing cart tomorrow morning.';
        }

        const selectedMaterials = (selectedWasteInput.value || 'metals').split(' ');

        lastBookingInfo = {
            day: scheduleDay,
            dateStr: scheduleDateStr,
            timeDisplay: displayScheduleTime,
            materials: selectedMaterials,
            address: addressInput.value
        };

        // Show Finding Overlay
        findingOverlay.classList.remove('hidden');
        setTimeout(() => findingOverlay.classList.add('fade-in'), 50);

        // Simulate Twilio wait time
        setTimeout(() => {
            findingOverlay.classList.remove('fade-in');
            
            setTimeout(() => {
                findingOverlay.classList.add('hidden');
                
                // Show Success Overlay
                successOverlay.classList.remove('hidden');
                setTimeout(() => successOverlay.classList.add('fade-in'), 50);

            }, 300);
            
        }, 2200); 
    });

    finishBtn.addEventListener('click', () => {
        successOverlay.classList.remove('fade-in');
        
        setTimeout(() => {
            successOverlay.classList.add('hidden');

            // Prepend new pending pickup card to Activity feed
            if (lastBookingInfo) {
                const activityCardsList = document.getElementById('activity-cards-list');
                if (activityCardsList) {
                    const materialTagsHtml = lastBookingInfo.materials.map(mat => {
                        const cap = mat.charAt(0).toUpperCase() + mat.slice(1);
                        const colorClass = scrapTypeColors[mat] ? `style="background-color: ${scrapTypeColors[mat]}"` : 'class="bg-brand-yellow"';
                        return `<div class="flex items-center gap-1.5 border-2 border-brand-black px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wide shadow-brutal-sm" ${colorClass}>
                            <i class="fa-solid fa-tag"></i> ${cap}
                        </div>`;
                    }).join('');

                    const newCard = document.createElement('div');
                    newCard.className = "pickup-card brutal-card expand-card bg-brand-green/20 border-2 border-brand-black shadow-brutal p-5 rounded-xl";
                    newCard.dataset.categories = lastBookingInfo.materials.join(' ');
                    newCard.dataset.date = lastBookingInfo.dateStr;
                    newCard.innerHTML = `
                        <div class="flex justify-between items-start mb-4">
                            <div>
                                <span class="bg-brand-yellow border-2 border-brand-black text-brand-black text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md shadow-brutal-sm animate-pulse">Scheduled</span>
                                <p class="font-black mt-3">${lastBookingInfo.timeDisplay}</p>
                            </div>
                            <p class="font-black text-sm bg-white px-2.5 py-1 rounded-lg border-2 border-brand-black shadow-brutal-sm uppercase">Pending Spot Quote</p>
                        </div>
                        <div class="flex flex-wrap gap-2 mt-4 pt-4 border-t-2 border-brand-gray">
                            ${materialTagsHtml}
                        </div>
                        <div class="details-section mt-4 pt-4 border-t-2 border-brand-black border-dashed">
                            <div class="flex justify-between text-xs font-bold mb-2">
                                <span class="text-gray-500">Address:</span>
                                <span class="text-right truncate max-w-[180px]">${lastBookingInfo.address}</span>
                            </div>
                            <div class="flex justify-between text-xs font-bold mb-2">
                                <span class="text-gray-500">Collector:</span>
                                <span>Raju Bhai (Cart #14)</span>
                            </div>
                            <div class="flex justify-between text-xs font-bold">
                                <span class="text-gray-500">Status:</span>
                                <span class="text-brand-greenDark">Assigned · On route</span>
                            </div>
                        </div>
                    `;

                    newCard.addEventListener('click', () => {
                        newCard.classList.toggle('expanded');
                    });

                    // Insert at top of cards feed
                    activityCardsList.prepend(newCard);
                }
            }

            addressInput.value = '';
            // Navigate to Activity page to inspect newly booked pickup
            document.querySelector('.nav-btn[data-target="page-activity"]').click();
        }, 300);
    });

    // --- Activity Filter Logic (Multi-Select) ---
    const searchInput = document.getElementById('activity-search');
    const dateInput = document.getElementById('activity-date');
    const filterContainer = document.getElementById('activity-filters');

    function filterPickups() {
        const currentPickupCards = document.querySelectorAll('.pickup-card');
        const noResultsEl = document.getElementById('no-results');
        if (!currentPickupCards.length) return;
        
        const searchText = searchInput ? searchInput.value.toLowerCase() : '';
        const searchDate = window.selectedDateStr || '';
        const activeTags = filterTags.filter(t => t.dataset.active === "true").map(t => t.dataset.category);
        const isAllSelected = activeTags.includes('all');
        
        let visibleCount = 0;

        currentPickupCards.forEach(card => {
            const cardDate = card.dataset.date || '';
            const cardCategories = (card.dataset.categories || '').split(' ');
            const cardText = card.innerText.toLowerCase();
            
            let dateMatch = true;
            if (searchDate) dateMatch = (cardDate === searchDate);
            
            let textMatch = true;
            if (searchText) textMatch = cardText.includes(searchText);
            
            let tagMatch = true;
            if (!isAllSelected && activeTags.length > 0) {
                tagMatch = cardCategories.some(cat => activeTags.includes(cat));
            }
            
            if (dateMatch && textMatch && tagMatch) {
                card.style.display = '';
                visibleCount++;
            } else {
                card.style.display = 'none';
            }
        });

        // Show/Hide "No Results Found"
        if (noResultsEl) {
            if (visibleCount === 0) {
                noResultsEl.classList.remove('hidden');
                noResultsEl.classList.add('flex');
            } else {
                noResultsEl.classList.add('hidden');
                noResultsEl.classList.remove('flex');
            }
        }

        // Highlight calendar button if a date filter is active
        const calBtn = document.getElementById('calendar-btn');
        if (calBtn) {
            if (searchDate) {
                calBtn.classList.remove('bg-brand-yellow');
                calBtn.classList.add('bg-brand-black', 'text-white');
                const calIcon = calBtn.querySelector('i');
                if (calIcon) calIcon.className = 'fa-solid fa-calendar-check text-xl text-brand-yellow';
            } else {
                calBtn.classList.add('bg-brand-yellow');
                calBtn.classList.remove('bg-brand-black', 'text-white');
                const calIcon = calBtn.querySelector('i');
                if (calIcon) calIcon.className = 'fa-solid fa-calendar-days text-xl text-brand-black';
            }
        }
    }

    if (searchInput) searchInput.addEventListener('input', filterPickups);
    
    const filterTags = Array.from(document.querySelectorAll('.filter-tag'));

    if (filterContainer && filterTags.length > 0) {
        const allTag = filterTags.find(t => t.dataset.category === 'all');
        const specificTags = filterTags.filter(t => t.dataset.category !== 'all');

        // Helper to set a tag to ACTIVE
        const setTagActive = (t) => {
            t.dataset.active = "true";
            const color = t.dataset.color;
            const isAll = t.dataset.category === 'all';
            
            t.classList.remove('bg-white', 'text-gray-400', 'border-gray-300', 'text-brand-black');
            t.classList.add(color, isAll ? 'text-white' : 'text-brand-black', 'border-2', 'border-brand-black', 'shadow-brutal-sm');
            
            const dot = t.querySelector('span');
            if (dot) {
                 dot.classList.remove('w-3', 'h-3', 'border-2', 'opacity-100', 'border-brand-black', 'border-gray-300');
                 dot.classList.add('w-0', 'h-0', 'border-0', 'opacity-0');
            }
        };

        // Helper to set a tag to INACTIVE
        const setTagInactive = (t, isAllSelected = false) => {
            t.dataset.active = "false";
            const color = t.dataset.color;
            const isAll = t.dataset.category === 'all';
            
            t.classList.remove(color, 'text-white', 'text-brand-black', 'text-gray-400', 'border-brand-black', 'border-gray-300', 'shadow-brutal-sm');
            
            const dot = t.querySelector('span');

            if (isAllSelected && !isAll) {
                // When ALL is selected, specific tags should NOT be greyed out!
                t.classList.add('bg-white', 'text-brand-black', 'border-2', 'border-brand-black', 'shadow-brutal-sm');
                if (dot) {
                    dot.classList.remove('w-0', 'h-0', 'border-0', 'opacity-0', 'border-gray-300');
                    dot.classList.add('w-3', 'h-3', 'border-2', 'border-brand-black', 'opacity-100');
                }
            } else {
                // When a specific filter is active, unselected tags are muted
                t.classList.add('bg-white', 'text-gray-400', 'border-2', 'border-gray-300');
                if (dot) {
                    dot.classList.remove('w-0', 'h-0', 'border-0', 'opacity-0', 'border-brand-black');
                    dot.classList.add('w-3', 'h-3', 'border-2', 'border-gray-300', 'opacity-100');
                }
            }
        };

        // Synchronize tag appearances based on whether ALL is active
        const refreshFilterTagsVisuals = () => {
            const isAllActive = allTag && allTag.dataset.active === "true";
            if (isAllActive) {
                setTagActive(allTag);
                specificTags.forEach(t => setTagInactive(t, true));
            } else {
                setTagInactive(allTag, false);
                specificTags.forEach(t => {
                    if (t.dataset.active === "true") {
                        setTagActive(t);
                    } else {
                        setTagInactive(t, false);
                    }
                });
            }
        };

        // Initialize state (ALL active, specific tags NOT greyed out)
        allTag.dataset.active = "true";
        specificTags.forEach(t => { t.dataset.active = "false"; });
        refreshFilterTagsVisuals();
        
        let currentOrderCounter = -1; // Use negative order to move items to front

        filterTags.forEach(tag => {
            tag.addEventListener('click', () => {
                const isAll = tag.dataset.category === 'all';

                if (isAll) {
                    // Clicked ALL: Deselect everything else
                    allTag.dataset.active = "true";
                    specificTags.forEach(t => {
                        t.dataset.active = "false";
                        t.style.order = 0; // Reset order for inactive tags
                    });
                    
                    currentOrderCounter--;
                    allTag.style.order = currentOrderCounter;
                } else {
                    // Clicked a specific tag
                    const isActive = tag.dataset.active === "true";
                    
                    if (isActive) {
                        tag.dataset.active = "false";
                        tag.style.order = 0; // Return to original order
                    } else {
                        tag.dataset.active = "true";
                        allTag.dataset.active = "false"; // Deselect ALL
                        allTag.style.order = 0;
                        
                        currentOrderCounter--;
                        tag.style.order = currentOrderCounter; // Move to front
                    }

                    // Check if any specific tag is still active
                    const anyActive = specificTags.some(t => t.dataset.active === "true");
                    if (!anyActive) {
                        // If all specific tags are deselected, default back to ALL
                        allTag.dataset.active = "true";
                        currentOrderCounter--;
                        allTag.style.order = currentOrderCounter;
                    }
                }
                
                // If "All" is active, make sure it stays at the very front
                if (allTag.dataset.active === "true") {
                    currentOrderCounter--;
                    allTag.style.order = currentOrderCounter;
                }

                refreshFilterTagsVisuals();
                filterContainer.scrollTo({ left: 0, behavior: 'smooth' });
                filterPickups();
            });
        });
    }

    // --- Services Page Tilt Card Logic ---
    const tiltCards = document.querySelectorAll('.tilt-card');
    tiltCards.forEach(card => {
        card.addEventListener('click', () => {
            const isExpanded = card.classList.contains('expanded');
            const wrapper = card.parentElement;

            if (isExpanded) {
                // Smoothly collapse the card
                card.classList.remove('expanded');
                card.classList.add('collapsing');
                
                // Keep wrapper and card elevated above neighbor during contraction
                setTimeout(() => {
                    card.classList.remove('collapsing');
                    if (!card.classList.contains('expanded')) {
                        wrapper.classList.remove('active');
                    }
                }, 350);
                
                // Remove dimming smoothly from all cards
                tiltCards.forEach(c => {
                    c.classList.remove('opacity-40', 'grayscale');
                });
            } else {
                // Collapse any other open card first
                tiltCards.forEach(c => {
                    if (c.classList.contains('expanded')) {
                        c.classList.remove('expanded');
                        c.classList.add('collapsing');
                        setTimeout(() => {
                            c.classList.remove('collapsing');
                            if (!c.classList.contains('expanded')) {
                                c.parentElement.classList.remove('active');
                            }
                        }, 350);
                    }
                    c.classList.add('opacity-40', 'grayscale');
                });

                // Un-dim and expand the clicked card
                card.classList.remove('opacity-40', 'grayscale', 'collapsing');
                card.classList.add('expanded');
                wrapper.classList.add('active');
            }
        });
    });

    // --- Tap to Scrap Direct Navigation ---
    const tapToScrapBtns = document.querySelectorAll('.tap-to-scrap-btn');
    tapToScrapBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Don't trigger the card collapse
            const scrapType = btn.dataset.scrapType;

            // 1. Unselect all waste buttons, then select the target material
            document.querySelectorAll('.waste-btn').forEach(b => {
                const badge = b.querySelector('.selected-badge');
                if (b.dataset.type === scrapType) {
                    b.classList.remove('bg-white');
                    b.classList.add(b.dataset.color, 'active');
                    if (badge) {
                        badge.classList.remove('hidden');
                        badge.classList.add('flex');
                    }
                } else {
                    b.classList.remove(b.dataset.color, 'active');
                    b.classList.add('bg-white');
                    if (badge) {
                        badge.classList.add('hidden');
                        badge.classList.remove('flex');
                    }
                }
            });
            if (typeof updateSelectedWasteInput === 'function') {
                updateSelectedWasteInput();
            }

            // 2. Switch to Home page
            const homeNavBtn = document.querySelector('.nav-btn[data-target="page-home"]');
            if (homeNavBtn) {
                homeNavBtn.click();
            }
        });
    });

    const expandCards = document.querySelectorAll('.expand-card');
    expandCards.forEach(card => {
        card.addEventListener('click', () => {
            card.classList.toggle('expanded');
        });
    });
    // --- Custom Calendar Logic ---
    const calendarBtn = document.getElementById('calendar-btn');
    const calendarOverlay = document.getElementById('calendar-overlay');
    const calendarModal = document.getElementById('calendar-modal');
    const calendarClose = document.getElementById('calendar-close');
    const calendarClear = document.getElementById('calendar-clear');
    const calendarPrev = document.getElementById('calendar-prev');
    const calendarNext = document.getElementById('calendar-next');
    const calendarMonth = document.getElementById('calendar-month');
    const calendarGrid = document.getElementById('calendar-grid');

    // Real system date
    const realToday = new Date();
    const todayYear = realToday.getFullYear();
    const todayMonth = realToday.getMonth();
    const todayDate = realToday.getDate();
    const todayDateStr = `${todayYear}-${String(todayMonth + 1).padStart(2, '0')}-${String(todayDate).padStart(2, '0')}`;

    // Color map for prominent scrap types
    const scrapTypeColors = {
        clothes: '#FEF08A', // brand-yellow
        metals:  '#BFDBFE', // brand-blue
        plastic: '#FBCFE8', // brand-pink
        paper:   '#A7F3D0', // brand-green
        ewaste:  '#E9D5FF', // brand-purple
        other:   '#FED7AA'  // brand-orange
    };

    // Helper: Map all pickup dates and their prominent scrap category
    function getScrapDateMap() {
        const dateMap = {};
        const cards = document.querySelectorAll('.pickup-card');
        cards.forEach(card => {
            const date = card.dataset.date;
            const cats = (card.dataset.categories || '').trim().split(/\s+/);
            if (date && cats.length > 0) {
                // First category in list is the primary/prominent scrap type
                const prominent = cats[0];
                dateMap[date] = scrapTypeColors[prominent] || '#FEF08A';
            }
        });
        return dateMap;
    }

    let currentDate = new Date(todayYear, todayMonth, 1);
    window.selectedDateStr = '';

    function renderCalendar() {
        if (!calendarGrid) return;
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const calendarHeader = document.getElementById('calendar-header');
        if (calendarHeader) {
            const monthColors = ['bg-brand-blue', 'bg-brand-pink', 'bg-brand-green', 'bg-brand-yellow', 'bg-brand-purple', 'bg-brand-orange', 'bg-brand-blue', 'bg-brand-pink', 'bg-brand-green', 'bg-brand-yellow', 'bg-brand-purple', 'bg-brand-orange'];
            calendarHeader.className = 'p-4 border-b-4 border-brand-black flex justify-between items-center transition-colors duration-300 ' + monthColors[month];
        }
        calendarMonth.innerText = `${monthNames[month]} ${year}`;

        calendarGrid.innerHTML = '';
        
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const scrapDateMap = getScrapDateMap();

        for (let i = 0; i < firstDay; i++) {
            const empty = document.createElement('div');
            empty.className = 'w-11 h-11';
            calendarGrid.appendChild(empty);
        }

        for (let i = 1; i <= daysInMonth; i++) {
            const dayBtn = document.createElement('button');
            const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
            const isToday = (dateStr === todayDateStr);
            const isSelected = (dateStr === window.selectedDateStr);
            const hasScrap = Boolean(scrapDateMap[dateStr]);
            const dotColor = scrapDateMap[dateStr];

            dayBtn.className = "w-11 h-11 mx-auto relative flex flex-col items-center justify-center rounded-xl transition-all font-black text-sm";
            
            if (isSelected) {
                dayBtn.className += " bg-brand-black text-white border-2 border-brand-black shadow-brutal-sm scale-105";
            } else if (isToday) {
                dayBtn.className += " bg-brand-yellow text-brand-black border-2 border-brand-black font-black shadow-brutal-sm";
            } else {
                dayBtn.className += " bg-white text-brand-black hover:bg-gray-100 border border-transparent";
            }

            // Date text
            const dayNum = document.createElement('span');
            dayNum.innerText = i;
            dayBtn.appendChild(dayNum);

            // Today badge or scrap sold dot
            if (hasScrap) {
                const dot = document.createElement('span');
                dot.className = "w-2 h-2 rounded-full border border-brand-black absolute bottom-0.5";
                dot.style.backgroundColor = dotColor;
                if (isSelected) {
                    dot.style.borderColor = "#FFFFFF";
                }
                dayBtn.appendChild(dot);
            }

            dayBtn.addEventListener('click', () => {
                // Clicking the already selected date clears it
                if (window.selectedDateStr === dateStr) {
                    window.selectedDateStr = '';
                } else {
                    window.selectedDateStr = dateStr;
                }
                renderCalendar();
            });

            calendarGrid.appendChild(dayBtn);
        }

        const totalCells = firstDay + daysInMonth;
        for (let i = totalCells; i < 42; i++) {
            const empty = document.createElement('div');
            empty.className = 'w-11 h-11';
            calendarGrid.appendChild(empty);
        }
    }

    if (calendarBtn && calendarOverlay) {
        calendarBtn.addEventListener('click', () => {
            calendarOverlay.classList.remove('hidden');
            calendarOverlay.classList.add('flex');
            setTimeout(() => {
                calendarModal.classList.remove('translate-y-full');
            }, 10);
            renderCalendar();
        });

        const closeCalendar = () => {
            calendarModal.classList.add('translate-y-full');
            setTimeout(() => {
                calendarOverlay.classList.add('hidden');
                calendarOverlay.classList.remove('flex');
                if (typeof filterPickups === 'function') filterPickups();
            }, 300);
        };

        calendarClose.addEventListener('click', closeCalendar);
        calendarOverlay.addEventListener('click', (e) => {
            if (e.target === calendarOverlay) closeCalendar();
        });

        calendarClear.addEventListener('click', () => {
            window.selectedDateStr = '';
            renderCalendar();
            closeCalendar();
        });

        calendarPrev.addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() - 1);
            renderCalendar();
        });
        calendarNext.addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() + 1);
            renderCalendar();
        });
    }

    // --- Profile Section Logic ---
    function updateProfileCashAndWeight() {
        const cards = document.querySelectorAll('#activity-cards-list .pickup-card');
        let totalCash = 0;
        let totalWeight = 0;

        cards.forEach(card => {
            const cardText = card.textContent;
            const amtMatch = cardText.match(/₹([\d,]+)/);
            if (amtMatch) {
                totalCash += parseInt(amtMatch[1].replace(/,/g, ''), 10);
            }

            const wtMatch = cardText.match(/(?:Total )?Weight:\s*([\d.]+)\s*kg/i);
            if (wtMatch) {
                totalWeight += parseFloat(wtMatch[1]);
            }
        });

        const cashElem = document.getElementById('profile-cash-amount');
        const weightElem = document.getElementById('profile-weight-amount');
        if (cashElem) {
            cashElem.textContent = `₹${totalCash.toLocaleString('en-IN')}`;
        }
        if (weightElem) {
            weightElem.textContent = `${totalWeight.toFixed(1)} kg sold`;
        }
    }

    // Toggle Saved Addresses Accordion
    const savedAddressesToggle = document.getElementById('profile-saved-addresses-toggle');
    const savedAddressesList = document.getElementById('profile-saved-addresses-list');
    const savedAddressesChevron = document.getElementById('profile-saved-chevron');

    if (savedAddressesToggle && savedAddressesList) {
        savedAddressesToggle.addEventListener('click', () => {
            const isHidden = savedAddressesList.classList.contains('hidden');
            if (isHidden) {
                savedAddressesList.classList.remove('hidden');
                if (savedAddressesChevron) savedAddressesChevron.classList.remove('-rotate-90');
            } else {
                savedAddressesList.classList.add('hidden');
                if (savedAddressesChevron) savedAddressesChevron.classList.add('-rotate-90');
            }
        });
    }

    // Handle "Select" button on Saved Address Tags in Profile
    function setupProfileAddressButtons() {
        document.querySelectorAll('.profile-use-address-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const tag = btn.dataset.tag;
                const lat = parseFloat(btn.dataset.lat);
                const lng = parseFloat(btn.dataset.lng);
                const address = btn.dataset.address;

                // 1. Switch to Home page
                const homeNavBtn = document.querySelector('.nav-btn[data-target="page-home"]');
                if (homeNavBtn) homeNavBtn.click();

                // 2. Select matching tag on Home page
                document.querySelectorAll('.saved-address-tag').forEach(t => {
                    if (t.dataset.tag === tag) {
                        t.click();
                    }
                });

                if (addressInput && address) {
                    addressInput.value = address;
                }
                if (typeof marker !== 'undefined' && marker && !isNaN(lat) && !isNaN(lng)) {
                    marker.setLatLng([lat, lng]);
                    if (typeof map !== 'undefined' && map) {
                        map.flyTo([lat, lng], 16, { duration: 0.8 });
                    }
                }
            });
        });
    }

    // Sync any new custom saved pin to Profile Saved Addresses list
    function syncProfileSavedAddresses() {
        const profileList = document.getElementById('profile-saved-addresses-list');
        const countBadge = document.getElementById('profile-saved-count');
        const homeTags = document.querySelectorAll('#saved-addresses-tags .saved-address-tag, #page-home .saved-address-tag');

        if (countBadge) {
            countBadge.textContent = `${homeTags.length} Tags`;
        }

        if (!profileList || homeTags.length === 0) return;

        profileList.innerHTML = '';
        const tagColors = {
            home: { bg: 'bg-brand-yellow', icon: 'fa-house' },
            office: { bg: 'bg-brand-blue', icon: 'fa-briefcase' },
            parents: { bg: 'bg-brand-pink', icon: 'fa-heart' },
            custom: { bg: 'bg-brand-green', icon: 'fa-bookmark' }
        };

        homeTags.forEach(t => {
            const tagKey = t.dataset.tag || 'custom';
            const colorInfo = tagColors[tagKey] || { bg: 'bg-brand-yellow', icon: 'fa-bookmark' };
            const label = t.textContent.trim();
            const address = t.dataset.address || 'Custom Pinned Address';
            const lat = t.dataset.lat || '12.9352';
            const lng = t.dataset.lng || '77.6245';

            const item = document.createElement('div');
            item.className = 'profile-address-item p-2.5 bg-brand-gray border-2 border-brand-black rounded-xl flex items-center justify-between gap-2 shadow-brutal-sm';
            item.innerHTML = `
                <div class="flex items-center gap-2 min-w-0">
                    <span class="profile-tag-badge ${colorInfo.bg} text-brand-black text-[10px] font-black uppercase px-2 py-0.5 rounded-md border border-brand-black shrink-0 flex items-center gap-1 shadow-brutal-sm">
                        <i class="fa-solid ${colorInfo.icon} text-[9px]"></i> ${label}
                    </span>
                    <p class="text-xs font-bold text-brand-black truncate">${address}</p>
                </div>
                <button type="button" class="profile-use-address-btn text-[10px] font-black uppercase bg-white hover:bg-brand-green text-brand-black px-2.5 py-1 rounded-md border border-brand-black shrink-0 shadow-brutal-sm transition-all" data-tag="${tagKey}" data-lat="${lat}" data-lng="${lng}" data-address="${address}">
                    Select
                </button>
            `;
            profileList.appendChild(item);
        });

        setupProfileAddressButtons();
    }

    // Initial setup for Profile
    updateProfileCashAndWeight();
    syncProfileSavedAddresses();
    setupProfileAddressButtons();

    // Log Out button
    const logoutBtn = document.getElementById('profile-logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to log out of Kabadigo?')) {
                alert('You have been logged out successfully.');
                const homeNavBtn = document.querySelector('.nav-btn[data-target="page-home"]');
                if (homeNavBtn) homeNavBtn.click();
            }
        });
    }

    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        // Initialize theme from localStorage or system preference
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark' || (!savedTheme && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }

        themeToggle.addEventListener('click', () => {
            const isDark = document.documentElement.classList.toggle('dark');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
        });
    }
});
