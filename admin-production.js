/* eslint-disable no-console, no-undef, no-unreachable, no-unused-vars */
/* jshint esversion: 8 */

// Initialize Firebase (config loaded from firebase-config.js)
if (typeof firebase === 'undefined') {
  console.error('Firebase SDK not loaded.');
} else {
  try {
    // Firebase already initialized in firebase-config.js
    if (!firebase.apps.length) {
      console.error('Firebase not initialized. Check firebase-config.js');
    }
    const auth = firebase.auth();
    const db = firebase.firestore();
    const storage = firebase.storage();
    console.log('Firebase initialized');

    // DOMPurify for XSS protection
    const DOMPurify = window.DOMPurify || (typeof DOMPurify !== 'undefined' ? DOMPurify : null);
    if (!DOMPurify) console.warn('DOMPurify not loaded. Input sanitization disabled.');

    // Utilities
    const $ = (s, r = document) => r.querySelector(s);
    const $all = (s, r = document) => [...r.querySelectorAll(s)];
    const createElement = (tag, attrs = {}, ...children) => {
      const el = document.createElement(tag);
      for (const k in attrs) {
        if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        else if (k === 'class') el.className = attrs[k];
        else if (k === 'html') el.innerHTML = DOMPurify ? DOMPurify.sanitize(attrs[k]) : attrs[k];
        else el.setAttribute(k, attrs[k]);
      }
      children.flat().forEach(c => {
        if (typeof c === 'string' || typeof c === 'number') el.appendChild(document.createTextNode(String(c)));
        else if (c instanceof Node) el.appendChild(c);
        else console.warn('Invalid child:', c);
      });
      return el;
    };
    const formatCurrency = v => '$' + Number(v).toFixed(2);
    const formatDate = d => new Date(d).toLocaleString();
    const debugMode = localStorage.getItem('debug') === 'true';
    const showMessage = (msg, type, isLogin = false) => {
      const sanitizedMsg = DOMPurify ? DOMPurify.sanitize(msg) : msg;
      const box = isLogin ? $('#loginMessage') : $('#messageBox');
      if (box) {
        box.textContent = sanitizedMsg;
        box.className = `messageBox ${type}`;
        box.style.display = 'block';
        setTimeout(() => box.style.display = 'none', 3000);
      }
      showToast(sanitizedMsg, type);
      if (debugMode) console.log(`[${type.toUpperCase()}] ${sanitizedMsg} (Line: ${new Error().stack.split('\n')[2].match(/:(\d+)/)[1]})`);
    };
    const showToast = (msg, type) => {
      const sanitizedMsg = DOMPurify ? DOMPurify.sanitize(msg) : msg;
      const toast = createElement('div', { class: `toast ${type}`, html: sanitizedMsg });
      const container = $('#toastContainer');
      if (container) {
        container.appendChild(toast);
        setTimeout(() => toast.style.display = 'block', 10);
        setTimeout(() => toast.remove(), 3000);
      }
    };

    // Helper function to get start of day
    const getStartOfDay = (date) => {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      return startOfDay;
    };

    // Admin Authentication
    const checkAdminStatus = async (uid) => {
      try {
        const adminDoc = await db.collection('admins').doc(uid).get();
        return adminDoc.exists;
      } catch (error) {
        console.error('Error checking admin status:', error);
        return false;
      }
    };

    const createAdminUser = async (email, password, name) => {
      try {
        // Create Firebase auth user
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Add to admins collection
        await db.collection('admins').doc(user.uid).set({
          email: email,
          name: name,
          role: 'admin',
          createdAt: new Date(),
          permissions: ['all']
        });
        
        showMessage('Admin user created successfully!', 'success');
        return user;
      } catch (error) {
        showMessage('Error creating admin user: ' + error.message, 'error');
        throw error;
      }
    };

    // Run Daily Payout (Admin-only manual trigger)
    const runDailyPayout = async () => {
      try {
        showMessage('Starting daily payout... This may take a few minutes.', 'success');
        const today = new Date();
        today.setHours(0,0,0,0);
        const yesterday = new Date(today.getTime() - 24*60*60*1000);

        const usersSnap = await db.collection('users').get();
        let processed = 0;
        let totalCredited = 0;
        for (const userDoc of usersSnap.docs) {
          const userId = userDoc.id;
          const userData = userDoc.data();
          // Compute ROI for yesterday
          let roiDaily = 0;
          const roiSettingsDoc = await db.collection('adminSettings').doc('roi').get();
          const roiSettings = roiSettingsDoc.exists ? roiSettingsDoc.data() : {};
          const dailyROI = roiSettings.dailyROI || 0.01;
          const maxROI = roiSettings.maxROI || 0.30;
          const depositsSnap = await db.collection('deposits').where('userId','==',userId).where('status','==','approved').get();
          depositsSnap.forEach(depDoc => {
            const dep = depDoc.data();
            const amount = dep.amount || 0;
            const approvedAt = dep.approvedAt?.toDate() || dep.createdAt?.toDate() || new Date();
            const daysSince = Math.floor((getStartOfDay(yesterday).getTime() - getStartOfDay(approvedAt).getTime())/(1000*60*60*24));
            const maxDays = Math.floor(maxROI / dailyROI);
            if (daysSince >= 0 && daysSince < maxDays) {
              roiDaily += amount * dailyROI;
            }
          });
          // Compute Level for yesterday (approx using current team)
          let levelDaily = 0;
          const levelIncomeSettings = await db.collection('settings').doc('levelIncomeList').get();
          const levelSettings = levelIncomeSettings.exists ? levelIncomeSettings.data().levels || [] : [];
          if (levelSettings.length > 0) {
            const teamData = await getUserTeamData(userId);
            for (let i=0;i<levelSettings.length;i++){
              const setting = levelSettings[i];
              if (setting.blocked) continue;
              const levelTeam = teamData[i] || [];
              const meets = await checkLevelConditions(userData, levelTeam, setting);
              if (!meets) continue;
              const dailyForLevel = levelTeam.reduce((sum,u)=>{
                if (u.status === 'active' && u.selfDeposit > 0) {
                  return sum + (u.selfDeposit * (setting.incomePercent/100));
                }
                return sum;
              },0);
              levelDaily += dailyForLevel;
            }
          }
          const totalDaily = roiDaily + levelDaily;
          if (totalDaily > 0) {
            await db.runTransaction(async (tx)=>{
              const userRef = db.collection('users').doc(userId);
              const userSnap = await tx.get(userRef);
              const currentBalance = userSnap.exists ? (userSnap.data().balance || 0) : 0;
              tx.update(userRef,{ balance: currentBalance + totalDaily });

              const txRef = db.collection('walletTransactions').doc();
              tx.set(txRef, {
                id: txRef.id,
                userId,
                type: 'dailyIncome',
                amount: totalDaily,
                roiPortion: roiDaily,
                levelPortion: levelDaily,
                forDate: getStartOfDay(yesterday).toISOString(),
                postedAt: firebase.firestore.FieldValue.serverTimestamp(),
                note: 'Daily income posted (admin)'
              });
            });
            processed++;
            totalCredited += totalDaily;
          }
        }
        showMessage(`✅ Daily payout completed. Users credited: ${processed}, Total: $${totalCredited.toFixed(2)}`,'success');
      } catch (e) {
        console.error('Run daily payout error:', e);
        showMessage('Failed to run daily payout', 'error');
      }
    };

    // State
    const state = {
      activeTab: 'dashboard',
      userList: [],
      levelIncomeList: [],
      rewardList: [],
      notifications: [],
      supportTickets: [],
      depositMethods: { usdtBep20: '', usdtTrc20: '', upiId: '', bankDetails: '' },
      currentUser: null,
      dashboardStats: { totalMembers: 0, activeUsers: 0, blockedUsers: 0, todaysIncome: 0, pendingWithdrawals: 0, pendingDeposits: 0 },
      roiSettings: { planType: 'daily', percentage: 1.2, duration: 30, status: 'active' },
      withdrawals: [],
      deposits: [],
      reports: { selfIncome: [], levelIncome: [], reward: [], roi: [] },
      content: { terms: '', about: '', faq: '', news: '' },
      settings: { role: 'admin', enable2fa: false, passwordPolicy: 'Min 8 chars, 1 uppercase, 1 number, 1 special char' },
      activityLogs: []
    };

    // Elements
    const loginSection = $('#loginSection');
    const appSection = $('#app');
    const loginForm = $('#loginForm');
    const loginSpinner = $('#loginSpinner');
    const logoutBtn = $('#logoutBtn');
    const sidebarFooter = $('#sidebarFooter');
    const themeToggle = $('#themeToggle');

    // Initialize isBlocked field for existing users (run once, then comment out)
    const initializeUserBlockedStatus = async () => {
      try {
        const snap = await db.collection('users').get();
        const batch = db.batch();
        snap.forEach(doc => {
          if (doc.data().isBlocked === undefined) {
            batch.update(doc.ref, { isBlocked: false });
          }
        });
        await batch.commit();
        console.log('Initialized isBlocked field for all users');
      } catch (e) {
        console.error('Error initializing isBlocked:', e);
      }
    };

    // Show Admin Panel
    const showAdminPanel = () => {
      const loginSection = $('#loginSection');
      const app = $('#app');
      
      if (loginSection) loginSection.style.display = 'none';
      if (app) app.hidden = false;
      
      // Load initial data
      loadUsers();
      loadDeposits();
      loadWithdrawals();
    };

    // Show Login Form
    const showLoginForm = () => {
      const loginSection = $('#loginSection');
      const app = $('#app');
      
      if (loginSection) loginSection.style.display = 'block';
      if (app) app.hidden = true;
    };

    // Admin Login Handler
    const handleAdminLogin = async (event) => {
      event.preventDefault();
      
      const email = $('#loginEmail')?.value;
      const password = $('#loginPassword')?.value;
      
      if (!email || !password) {
        showMessage('Please enter email and password', 'error', true);
        return;
      }
      
      try {
        showMessage('Logging in...', 'info', true);
        
        // Sign in with Firebase Auth
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Check if user is admin
        const isAdmin = await checkAdminStatus(user.uid);
        
        if (!isAdmin) {
          await auth.signOut();
          showMessage('Access denied. Admin privileges required.', 'error', true);
          return;
        }
        
        showMessage('Login successful!', 'success', true);
        showAdminPanel();
        
      } catch (error) {
        showMessage('Login failed: ' + error.message, 'error', true);
      }
    };

    // Hook: Run Daily Payout button
    document.addEventListener('DOMContentLoaded', () => {
      // Admin login form handler
      const adminLoginForm = $('#loginForm');
      if (adminLoginForm) {
        adminLoginForm.addEventListener('submit', handleAdminLogin);
      }

      // Create admin user button (for first time setup)
      const createAdminBtn = $('#createAdminBtn');
      if (createAdminBtn) {
        createAdminBtn.addEventListener('click', async () => {
          const email = prompt('Enter admin email:');
          const password = prompt('Enter admin password:');
          const name = prompt('Enter admin name:');
          
          if (email && password && name) {
            try {
              await createAdminUser(email, password, name);
            } catch (error) {
              showMessage('Failed to create admin user', 'error');
            }
          }
        });
      }

      // Auto Calculate Total Business button
      const autoCalculateBtn = $('#autoCalculateBtn');
      if (autoCalculateBtn) {
        autoCalculateBtn.addEventListener('click', async () => {
          state.rewardList.forEach((item, index) => {
            autoCalculateTotalBusiness(item, true); // Force update
            // Update the state array directly
            state.rewardList[index] = { ...item };
          });
          renderRewardRank();
          
          // Auto-save after calculation
          try {
            await db.collection('settings').doc('rewardList').set({ 
              ranks: state.rewardList,
              lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            });
            showMessage('Total Business recalculated and saved for all ranks using 50% rule', 'success');
          } catch (e) {
            console.error('Error auto-saving after calculation:', e);
            showMessage('Calculated but failed to auto-save', 'warning');
          }
        });
      }

      const btn = document.getElementById('runDailyPayoutBtn');
      if (btn) {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          btn.textContent = 'Running...';
          try {
            await runDailyPayout();
          } finally {
            btn.disabled = false;
            btn.textContent = 'Run Daily Payout';
          }
        });
      }
    });
    // initializeUserBlockedStatus(); // Uncomment to run once, then comment out

    // Daily income calculation scheduler (runs at 10 AM daily)
    const scheduleDailyIncomeCalculation = () => {
      const now = new Date();
      const tenAM = new Date();
      tenAM.setHours(10, 0, 0, 0);
      
      // If it's past 10 AM today, schedule for tomorrow
      if (now > tenAM) {
        tenAM.setDate(tenAM.getDate() + 1);
      }
      
      const timeUntilTenAM = tenAM.getTime() - now.getTime();
      
      setTimeout(async () => {
        console.log('🕙 10 AM - Running daily income calculations...');
        
        try {
          // Get all users
          const usersSnapshot = await db.collection('users').get();
          
          for (const userDoc of usersSnapshot.docs) {
            const userData = userDoc.data();
            
            // Calculate ROI for this user
            await calculateUserROI(userDoc.id, userData);
            
            // Calculate level income for this user
            await calculateUserLevelIncome(userDoc.id, userData);
          }
          
          console.log('✅ Daily income calculations completed for all users');
          
          // Schedule next calculation for tomorrow
          scheduleDailyIncomeCalculation();
        } catch (error) {
          console.error('❌ Error in daily income calculation:', error);
          
          // Retry in 1 hour if failed
          setTimeout(() => {
            scheduleDailyIncomeCalculation();
          }, 60 * 60 * 1000);
        }
      }, timeUntilTenAM);
      
      console.log(`📅 Next daily income calculation scheduled for: ${tenAM.toLocaleString()}`);
    };

    // Handle page visibility changes to ensure scheduler persistence
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Page became visible - check if scheduler should be running
        const schedulerState = localStorage.getItem('roiSchedulerState');
        if (schedulerState) {
          const state = JSON.parse(schedulerState);
          if (state.isRunning && state.autoPersist) {
            console.log('🔄 Page became visible - checking ROI scheduler status...');
            // Check if scheduler is still running, restart if needed
            setTimeout(() => {
              checkROISchedulerStatus();
            }, 1000);
          }
        }
      }
    };

    // Enhanced Automatic ROI Scheduler - Runs independently and persists across sessions
    const startAutomaticROIScheduler = async () => {
      try {
        console.log('🚀 Starting Enhanced Automatic ROI Scheduler...');
        
        // Check if ROI settings exist and are active
        const roiSettingsDoc = await db.collection('adminSettings').doc('roi').get();
        if (!roiSettingsDoc.exists) {
          console.log('❌ ROI settings not found');
          return;
        }
        
        const roiSettings = roiSettingsDoc.data();
        if (roiSettings.status !== 'active') {
          console.log('❌ ROI is not active');
          return;
        }

        // Store scheduler state in localStorage for persistence across browser sessions
        const schedulerState = {
          isRunning: true,
          startedAt: Date.now(),
          lastRun: roiSettings.lastScheduledAt?.toDate?.() || new Date(),
          nextRun: null,
          settingsVersion: roiSettings.settingsVersion
        };
        localStorage.setItem('roiSchedulerState', JSON.stringify(schedulerState));
        
        // Schedule daily ROI calculation at 10 AM with enhanced persistence
        const scheduleROICalculation = () => {
          const now = new Date();
          const tenAM = new Date();
          tenAM.setHours(10, 0, 0, 0);
          
          // If it's past 10 AM today, schedule for tomorrow
          if (now > tenAM) {
            tenAM.setDate(tenAM.getDate() + 1);
          }
          
          const timeUntilTenAM = tenAM.getTime() - now.getTime();
          
          // Update scheduler state
          schedulerState.nextRun = tenAM.toISOString();
          localStorage.setItem('roiSchedulerState', JSON.stringify(schedulerState));
          
          console.log(`📅 Next automatic ROI calculation scheduled for: ${tenAM.toLocaleString()}`);
          
          setTimeout(async () => {
            console.log('🕙 10 AM - Automatic ROI calculation running...');
            
            try {
              // Verify settings haven't changed before running
              const currentSettings = await db.collection('adminSettings').doc('roi').get();
              if (!currentSettings.exists) {
                console.log('❌ ROI settings no longer exist, stopping scheduler');
                return;
              }
              
              const currentROI = currentSettings.data();
              if (currentROI.status !== 'active' || currentROI.settingsVersion !== roiSettings.settingsVersion) {
                console.log('❌ ROI settings changed or deactivated, stopping scheduler');
                return;
              }
              
              // Get all active users
              const usersSnapshot = await db.collection('users').where('isActive', '==', true).get();
              let processed = 0;
              let totalROICalculated = 0;
              
              for (const userDoc of usersSnapshot.docs) {
                const userData = userDoc.data();
                
                // Calculate ROI for this user
                await calculateUserROI(userDoc.id, userData);
                processed++;
                
                // Update progress every 10 users
                if (processed % 10 === 0) {
                  console.log(`📊 Processed ${processed}/${usersSnapshot.size} users...`);
                }
              }
              
              console.log(`✅ Automatic ROI calculation completed for ${processed} users`);
              
              // Update last scheduled time and run count
              await db.collection('adminSettings').doc('roi').update({
                lastScheduledAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastRunAt: firebase.firestore.FieldValue.serverTimestamp(),
                totalRuns: firebase.firestore.FieldValue.increment(1),
                lastProcessedUsers: processed
              });
              
              // Update scheduler state
              schedulerState.lastRun = new Date().toISOString();
              localStorage.setItem('roiSchedulerState', JSON.stringify(schedulerState));
              
              // Schedule next calculation for tomorrow
              scheduleROICalculation();
              
            } catch (error) {
              console.error('❌ Error in automatic ROI calculation:', error);
              
              // Log error to database for admin review
              await db.collection('adminSettings').doc('roi').update({
                lastError: {
                  message: error.message,
                  timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                  stack: error.stack
                }
              });
              
              // Retry in 1 hour if failed
              setTimeout(() => {
                scheduleROICalculation();
              }, 60 * 60 * 1000);
            }
          }, timeUntilTenAM);
        };
        
        // Start the scheduler
        scheduleROICalculation();
        
        // Set up periodic health check every 6 hours
        const healthCheckInterval = setInterval(async () => {
          try {
            const healthCheck = await db.collection('adminSettings').doc('roi').get();
            if (!healthCheck.exists || healthCheck.data().status !== 'active') {
              console.log('🔄 ROI deactivated, stopping health check');
              clearInterval(healthCheckInterval);
              return;
            }
            
            // Update scheduler heartbeat
            await db.collection('adminSettings').doc('roi').update({
              schedulerHeartbeat: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            console.log('💓 ROI Scheduler heartbeat updated');
          } catch (error) {
            console.error('❌ Health check failed:', error);
          }
        }, 6 * 60 * 60 * 1000); // 6 hours
        
        console.log('✅ Enhanced Automatic ROI Scheduler started successfully!');
        
        // Show success message in admin panel
        showMessage('🔄 Enhanced ROI Scheduler started! Settings will persist automatically until manually changed.', 'success');
        
      } catch (error) {
        console.error('❌ Error starting enhanced automatic ROI scheduler:', error);
        showMessage('Failed to start ROI scheduler', 'error');
      }
    };

    // Enhanced function to check and start automatic ROI scheduler
    const checkAndStartAutomaticROI = async () => {
      try {
        const roiSettingsDoc = await db.collection('adminSettings').doc('roi').get();
        if (roiSettingsDoc.exists) {
          const roiSettings = roiSettingsDoc.data();
          
          // Check if auto-persist is enabled and settings are active
          if (roiSettings.status === 'active' && roiSettings.autoScheduler && roiSettings.autoPersist) {
            console.log('🔄 Auto-starting enhanced ROI scheduler from saved persistent settings...');
            
            // Check if scheduler is already running
            const schedulerState = localStorage.getItem('roiSchedulerState');
            if (schedulerState) {
              const state = JSON.parse(schedulerState);
              if (state.isRunning && state.settingsVersion === roiSettings.settingsVersion) {
                console.log('✅ ROI Scheduler already running with current settings');
                return;
              }
            }
            
            startAutomaticROIScheduler();
          }
        }
      } catch (error) {
        console.error('❌ Error checking automatic ROI settings:', error);
      }
    };

    // Function to stop ROI scheduler
    const stopROIScheduler = async () => {
      try {
        const schedulerState = localStorage.getItem('roiSchedulerState');
        if (schedulerState) {
          const state = JSON.parse(schedulerState);
          state.isRunning = false;
          state.stoppedAt = new Date().toISOString();
          state.stoppedBy = 'admin_manual';
          localStorage.setItem('roiSchedulerState', JSON.stringify(state));
        }
        
        // Clear any existing intervals
        if (window.roiSchedulerInterval) {
          clearInterval(window.roiSchedulerInterval);
          window.roiSchedulerInterval = null;
        }
        
        // Clear any existing timeouts
        if (window.roiSchedulerTimeout) {
          clearTimeout(window.roiSchedulerTimeout);
          window.roiSchedulerTimeout = null;
        }
        
        // Update database to indicate scheduler stopped
        await db.collection('adminSettings').doc('roi').update({
          schedulerStoppedAt: firebase.firestore.FieldValue.serverTimestamp(),
          autoScheduler: false
        });
        
        console.log('🛑 ROI Scheduler stopped manually');
        showMessage('🛑 ROI Scheduler stopped manually. Settings will persist but scheduler is inactive.', 'warning');
        
        // Update the status display
        setTimeout(() => {
          checkROISchedulerStatus();
        }, 1000);
        
      } catch (error) {
        console.error('❌ Error stopping ROI scheduler:', error);
        showMessage('Failed to stop ROI scheduler', 'error');
      }
    };

    // Function to restart ROI scheduler
    const restartROIScheduler = async () => {
      try {
        // Check if ROI settings exist and are active
        const roiSettingsDoc = await db.collection('adminSettings').doc('roi').get();
        if (!roiSettingsDoc.exists) {
          showMessage('No ROI settings found. Please save ROI settings first.', 'error');
          return;
        }
        
        const roiSettings = roiSettingsDoc.data();
        if (roiSettings.status !== 'active') {
          showMessage('ROI is not active. Please activate ROI first.', 'warning');
          return;
        }
        
        // Start the enhanced scheduler
        await startAutomaticROIScheduler();
        showMessage('🚀 ROI Scheduler restarted successfully!', 'success');
        
        // Update status display
        setTimeout(() => {
          checkROISchedulerStatus();
        }, 1000);
        
      } catch (error) {
        console.error('❌ Error restarting ROI scheduler:', error);
        showMessage('Failed to restart scheduler', 'error');
      }
    };

    // Function to check ROI scheduler status and display in UI
    const checkROISchedulerStatus = async () => {
      try {
        const schedulerState = localStorage.getItem('roiSchedulerState');
        const roiSettings = await db.collection('adminSettings').doc('roi').get();
        
        if (!roiSettings.exists) {
          showMessage('No ROI settings found in database', 'error');
          return;
        }
        
        const roi = roiSettings.data();
        let statusInfo = '';
        
        if (!schedulerState) {
          statusInfo = `
            <div style="background: rgba(220, 53, 69, 0.2); padding: 15px; border-radius: 8px; border-left: 4px solid #dc3545;">
              <h4 style="color: #dc3545; margin: 0 0 10px 0;">🛑 Scheduler Status: NOT RUNNING</h4>
              <p style="margin: 5px 0;"><strong>Reason:</strong> No scheduler state found</p>
              <p style="margin: 5px 0;"><strong>Action:</strong> Save ROI settings to start scheduler</p>
            </div>
          `;
        } else {
          try {
            const state = JSON.parse(schedulerState);
            if (!state.isRunning) {
              statusInfo = `
                <div style="background: rgba(220, 53, 69, 0.2); padding: 15px; border-radius: 8px; border-left: 4px solid #dc3545;">
                  <h4 style="color: #dc3545; margin: 0 0 10px 0;">🛑 Scheduler Status: STOPPED</h4>
                  <p style="margin: 5px 0;"><strong>Reason:</strong> Scheduler was manually stopped</p>
                  <p style="margin: 5px 0;"><strong>Action:</strong> Save ROI settings to restart scheduler</p>
                </div>
              `;
            } else if (state.settingsVersion !== roi.settingsVersion) {
              statusInfo = `
                <div style="background: rgba(255, 193, 7, 0.2); padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107;">
                  <h4 style="color: #ffc107; margin: 0 0 10px 0;">⚠️ Scheduler Status: OUTDATED</h4>
                  <p style="margin: 5px 0;"><strong>Reason:</strong> Settings changed but scheduler still running old version</p>
                  <p style="margin: 5px 0;"><strong>Action:</strong> Save ROI settings to update scheduler</p>
                  <p style="margin: 5px 0;"><strong>Current Version:</strong> ${roi.settingsVersion ? new Date(roi.settingsVersion).toLocaleString() : 'N/A'}</p>
                  <p style="margin: 5px 0;"><strong>Scheduler Version:</strong> ${state.settingsVersion ? new Date(state.settingsVersion).toLocaleString() : 'N/A'}</p>
                </div>
              `;
            } else {
              const startedAt = new Date(state.startedAt);
              const lastRun = state.lastRun ? new Date(state.lastRun) : null;
              const nextRun = state.nextRun ? new Date(state.nextRun) : null;
              
              statusInfo = `
                <div style="background: rgba(40, 167, 69, 0.2); padding: 15px; border-radius: 8px; border-left: 4px solid #28a745;">
                  <h4 style="color: #28a745; margin: 0 0 10px 0;">🚀 Scheduler Status: RUNNING</h4>
                  <p style="margin: 5px 0;"><strong>Started:</strong> ${startedAt.toLocaleString()}</p>
                  ${lastRun ? `<p style="margin: 5px 0;"><strong>Last Run:</strong> ${lastRun.toLocaleString()}</p>` : ''}
                  ${nextRun ? `<p style="margin: 5px 0;"><strong>Next Run:</strong> ${nextRun.toLocaleString()}</p>` : ''}
                  <p style="margin: 5px 0;"><strong>Status:</strong> ✅ Active and persistent across browser sessions</p>
                  <p style="margin: 5px 0;"><strong>Settings Version:</strong> ${roi.settingsVersion ? new Date(roi.settingsVersion).toLocaleString() : 'N/A'}</p>
                </div>
              `;
            }
          } catch (e) {
            console.error('Error parsing scheduler state:', e);
            statusInfo = `
              <div style="background: rgba(220, 53, 69, 0.2); padding: 15px; border-radius: 8px; border-left: 4px solid #dc3545;">
                <h4 style="color: #dc3545; margin: 0 0 10px 0;">❌ Scheduler Status: ERROR</h4>
                <p style="margin: 5px 0;"><strong>Reason:</strong> Corrupted scheduler state</p>
                <p style="margin: 5px 0;"><strong>Action:</strong> Save ROI settings to reset scheduler</p>
              </div>
            `;
          }
        }
        
        // Display status in the UI
        const statusDisplay = document.getElementById('schedulerStatusDisplay');
        if (statusDisplay) {
          statusDisplay.innerHTML = statusInfo;
        }
        
        // Also show toast message
        const status = !schedulerState ? 'not_running' : 
                     JSON.parse(schedulerState).isRunning ? 'running' : 'stopped';
        
        if (status === 'running') {
          showMessage('✅ ROI Scheduler is running normally with enhanced persistence', 'success');
        } else if (status === 'stopped') {
          showMessage('🛑 ROI Scheduler is stopped', 'warning');
        } else {
          showMessage('❌ ROI Scheduler is not running', 'error');
        }
        
      } catch (error) {
        console.error('❌ Error checking scheduler status:', error);
        showMessage('Error checking scheduler status', 'error');
      }
    };



    // Function to check if ROI settings have been manually modified
    const checkROISettingsModified = () => {
      const currentPlanType = $('#roiPlanType')?.value;
      const currentPercentage = parseFloat($('#roiPercentage')?.value);
      const currentDuration = parseInt($('#roiDuration')?.value);
      const currentStatus = $('#roiStatus')?.value;
      
      const savedSettings = state.roiSettings;
      
      if (!savedSettings.planType) return false;
      
      return currentPlanType !== savedSettings.planType ||
             currentPercentage !== savedSettings.monthlyPercentage ||
             currentDuration !== savedSettings.duration ||
             currentStatus !== savedSettings.status;
    };

    // Function to show ROI settings status
    const showROISettingsStatus = () => {
      const savedSettings = state.roiSettings;
      if (savedSettings.autoPersist && savedSettings.planType) {
        const lastSaved = savedSettings.updatedAt?.toDate ? savedSettings.updatedAt.toDate() : new Date(savedSettings.updatedAt);
        const statusMsg = `ROI Settings: ${savedSettings.planType} plan, ${savedSettings.monthlyPercentage}% return, ${savedSettings.duration} ${savedSettings.planType === 'daily' ? 'days' : savedSettings.planType === 'weekly' ? 'weeks' : 'months'}. Last saved: ${lastSaved.toLocaleDateString()} by ${savedSettings.lastSavedBy || 'admin'}. Settings will persist automatically.`;
        showMessage(statusMsg, 'success');
      }
    };

    // Calculate ROI for a specific user
    const calculateUserROI = async (userId, userData) => {
      try {
        console.log(`🔄 Calculating ROI for user: ${userId}`);
        
        // Get admin ROI settings
        const adminSettingsDoc = await db.collection('adminSettings').doc('roi').get();
        if (!adminSettingsDoc.exists) {
          console.log('❌ Admin ROI settings not found');
          return;
        }

        const roiSettings = adminSettingsDoc.data();
        const dailyROI = roiSettings.dailyROI || 0.01;
        const maxROI = roiSettings.maxROI || 0.30;
        
        console.log(`📊 ROI Settings - Daily: ${(dailyROI * 100).toFixed(4)}%, Max: ${(maxROI * 100).toFixed(2)}%`);

        // Get user's deposits
        const depositsSnapshot = await db.collection('deposits')
          .where('userId', '==', userId)
          .where('status', '==', 'approved')
          .get();

        let totalROIEarned = 0;
        let dailyROIEarned = 0;
        let totalDeposits = 0;

        console.log(`💰 Found ${depositsSnapshot.size} approved deposits for user ${userId}`);

        depositsSnapshot.docs.forEach((doc, index) => {
          const deposit = doc.data();
          const depositAmount = deposit.amount || 0;
          const depositDate = deposit.approvedAt?.toDate() || new Date();
          const daysSinceDeposit = Math.floor((Date.now() - depositDate.getTime()) / (1000 * 60 * 60 * 24));
          
          totalDeposits += depositAmount;
          
          // Calculate total ROI for this deposit
          const maxROIDays = Math.floor(maxROI / dailyROI);
          const roiDays = Math.min(daysSinceDeposit, maxROIDays);
          const roiEarned = depositAmount * dailyROI * roiDays;
          
          totalROIEarned += roiEarned;
          
          // Calculate today's ROI
          const todayROI = depositAmount * dailyROI;
          dailyROIEarned += todayROI;
          
          console.log(`📈 Deposit ${index + 1}: $${depositAmount} | Days: ${daysSinceDeposit} | ROI Earned: $${roiEarned.toFixed(2)} | Today's ROI: $${todayROI.toFixed(2)}`);
        });

        // Add today's ROI to income history if it's a new day
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const lastROIDate = userData.lastROIDate ? new Date(userData.lastROIDate.toDate()) : null;
        if (!lastROIDate || lastROIDate < today) {
          if (dailyROIEarned > 0) {
            console.log(`✅ Adding daily ROI to income history: $${dailyROIEarned.toFixed(2)}`);
            
            await db.collection('income').add({
              userId: userId,
              type: 'roi',
              amount: dailyROIEarned,
              status: 'credited',
              createdAt: firebase.firestore.FieldValue.serverTimestamp(),
              description: 'Daily ROI Income'
            });
            
            await db.collection('users').doc(userId).update({
              lastROIDate: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            console.log(`✅ Daily ROI income added to history for user ${userId}`);
          } else {
            console.log(`ℹ️ No daily ROI to add for user ${userId} (amount: $${dailyROIEarned.toFixed(2)})`);
          }
        } else {
          console.log(`ℹ️ ROI already calculated today for user ${userId}`);
        }

        // Update user's ROI income
        await db.collection('users').doc(userId).update({
          roiIncome: totalROIEarned,
          totalDeposits: totalDeposits,
          lastROICalculation: firebase.firestore.FieldValue.serverTimestamp()
        });

        console.log(`✅ ROI calculation completed for user ${userId}: Total ROI: $${totalROIEarned.toFixed(2)}, Daily ROI: $${dailyROIEarned.toFixed(2)}`);

      } catch (error) {
        console.error(`❌ Error calculating ROI for user ${userId}:`, error);
      }
    };

    // Calculate level income for a specific user
    const calculateUserLevelIncome = async (userId, userData) => {
      try {
        // Get level income settings from admin
        const levelIncomeSettings = await db.collection('settings').doc('levelIncomeList').get();
        const levelSettings = levelIncomeSettings.exists ? levelIncomeSettings.data().levels || [] : [];
        
        if (levelSettings.length === 0) {
          console.log('No level income settings found');
          return;
        }

        // Get user's team data
        const teamData = await getUserTeamData(userId);
        let totalLevelIncome = 0;
        let dailyLevelIncome = 0;

        // Calculate income for each level
        for (let levelIndex = 0; levelIndex < levelSettings.length; levelIndex++) {
          const levelSetting = levelSettings[levelIndex];
          
          if (levelSetting.blocked) continue;

          const levelNumber = levelIndex + 1;
          const levelTeam = teamData[levelIndex] || [];
          
          // Check if user meets conditions for this level
          const meetsConditions = await checkLevelConditions(userData, levelTeam, levelSetting);
          
          if (meetsConditions) {
            // Calculate income for this level
            const levelBusiness = levelTeam.reduce((sum, user) => sum + (user.selfDeposit || 0), 0);
            const levelIncome = levelBusiness * (levelSetting.incomePercent / 100);
            
            totalLevelIncome += levelIncome;
            
            // Calculate daily income for active users
            const dailyIncomeForLevel = levelTeam.reduce((sum, user) => {
              if (user.status === 'active' && user.selfDeposit > 0) {
                return sum + (user.selfDeposit * (levelSetting.incomePercent / 100));
              }
              return sum;
            }, 0);
            
            dailyLevelIncome += dailyIncomeForLevel;
          }
        }

        // Add daily level income to income history if it's a new day
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const lastLevelIncomeDate = userData.lastLevelIncomeDate ? new Date(userData.lastLevelIncomeDate.toDate()) : null;
        if (!lastLevelIncomeDate || lastLevelIncomeDate < today) {
          if (dailyLevelIncome > 0) {
            await db.collection('income').add({
              userId: userId,
              type: 'level',
              amount: dailyLevelIncome,
              status: 'credited',
              createdAt: firebase.firestore.FieldValue.serverTimestamp(),
              description: 'Daily Level Income',
              level: 'all'
            });
            
            await db.collection('users').doc(userId).update({
              lastLevelIncomeDate: firebase.firestore.FieldValue.serverTimestamp()
            });
          }
        }

        // Update user's level income
        await db.collection('users').doc(userId).update({
          levelIncome: totalLevelIncome
        });

        console.log(`Level income calculated for user ${userId}: $${totalLevelIncome.toFixed(2)}`);

      } catch (error) {
        console.error(`Error calculating level income for user ${userId}:`, error);
      }
    };

    // Helper function to get user's team data
    const getUserTeamData = async (userId) => {
      const teamData = [];
      let currentLevel = [userId];
      
      for (let level = 0; level < 30; level++) {
        const nextLevel = [];
        
        for (const currentUserId of currentLevel) {
          const referralsSnapshot = await db.collection('referrals')
            .where('referrerId', '==', currentUserId)
            .get();
          
          for (const doc of referralsSnapshot.docs) {
            const referral = doc.data();
            const userDoc = await db.collection('users').doc(referral.referredId).get();
            
            if (userDoc.exists) {
              nextLevel.push(userDoc.data());
            }
          }
        }
        
        if (nextLevel.length === 0) break;
        teamData.push(nextLevel);
        currentLevel = nextLevel;
      }
      
      return teamData;
    };

    // Helper function to check if user meets level conditions
    const checkLevelConditions = async (userData, levelTeam, levelSetting) => {
      // Check self investment condition
      const userTotalInvestment = userData.selfDeposit || 0;
      if (userTotalInvestment < levelSetting.selfInvestmentCondition) {
        return false;
      }

      // Check total team business condition
      const totalTeamBusiness = levelTeam.reduce((sum, user) => sum + (user.selfDeposit || 0), 0);
      if (totalTeamBusiness < levelSetting.totalTeamBusinessCondition) {
        return false;
      }

      // Check total team size condition
      const totalTeamSize = levelTeam.length;
      if (totalTeamSize < levelSetting.totalTeamSizeCondition) {
        return false;
      }

      return true;
    };

    // Get all referral levels for a user (helper function)
    const getAllReferralLevels = async (userId, maxLevels = 10) => {
      const levels = [];
      let currentLevel = [userId];
      
      for (let i = 0; i < maxLevels; i++) {
        const nextLevel = [];
        
        for (const currentUserId of currentLevel) {
          const referralsSnapshot = await db.collection('referrals')
            .where('referrerId', '==', currentUserId)
            .get();
          
          for (const doc of referralsSnapshot.docs) {
            const referral = doc.data();
            const userDoc = await db.collection('users').doc(referral.referredId).get();
            
            if (userDoc.exists) {
              nextLevel.push(userDoc.data());
            }
          }
        }
        
        if (nextLevel.length === 0) break;
        levels.push(nextLevel);
        currentLevel = nextLevel;
      }
      
      return levels;
    };

    // Authentication
    const initializeApp = async () => {
      try {
        await new Promise((resolve, reject) => {
          auth.onAuthStateChanged(async user => {
            try {
              console.log('Auth state:', user ? `Logged in: ${user.email} (UID: ${user.uid})` : 'No user');
              state.currentUser = user;
              if (loginSpinner?.style) loginSpinner.style.display = 'none';
              if (user) {
                const adminDoc = await db.collection('admins').doc(user.uid).get();
                if (!adminDoc.exists) {
                  console.warn('Unauthorized user detected:', user.uid);
                  showMessage('Access denied: You do not have admin permissions.', 'error');
                  auth.signOut();
                  reject(new Error('No admin permissions'));
                  return;
                }
                if (loginSection?.style) loginSection.style.display = 'none';
                if (appSection) appSection.hidden = false;
                if (sidebarFooter) sidebarFooter.textContent = `Admin: ${user.email} | © 2025 TheOneWealthWave`;
                await Promise.all([
                  loadDashboardStats(),
                  loadUsers(),
                  initLevelIncome(),
                  loadRewardRank(),
                  loadNotifications(),
                  loadROISettings(),
                  loadDeposits(),
                  loadWithdrawals(),
                  loadContent(),
                  loadSettings(),
                  loadActivityLogs(),
                  loadSupportTickets()
                ]);
                setupScreenshotModal();
                setupDepositActions();
                
                // Start daily income calculation scheduler
                scheduleDailyIncomeCalculation();
                
                // Check and start automatic ROI scheduler
                await checkAndStartAutomaticROI();
                
                // Set up page visibility change handler for scheduler persistence
                document.addEventListener('visibilitychange', handleVisibilityChange);
                
                // Set up reward system event listeners
                $('#btnSaveRewardRank')?.addEventListener('click', saveRewardRank);
                $('#btnAssignRewards')?.addEventListener('click', assignRewardsToUsers);
                $('#btnAddRewardLevel')?.addEventListener('click', addRewardLevel);
                $('#btnResetRewardLevels')?.addEventListener('click', resetRewardLevels);
                
                // Set up rank settings form event listener
                $('#rankSettingsForm')?.addEventListener('submit', e => {
                  e.preventDefault();
                  const rules = DOMPurify ? DOMPurify.sanitize($('#rankRulesText')?.value) : $('#rankRulesText')?.value;
                  db.collection('settings').doc('rankRules').set({ rules })
                    .then(() => showMessage('Rank settings saved!', 'success'))
                    .catch(e => showMessage(`Error: ${e.message}`, 'error'));
                });
                
                switchTab(user.email === 'support@theonewealthwave.com' ? 'support' : 'dashboard');
                resolve();
              } else {
                if (loginSection?.style) loginSection.style.display = 'flex';
                if (appSection) appSection.hidden = true;
                if (sidebarFooter) sidebarFooter.textContent = '© 2025 TheOneWealthWave';
                reject(new Error('No user authenticated'));
              }
            } catch (e) {
              console.error('Error in auth state handling:', e);
              showMessage('Failed to initialize admin panel', 'error');
              reject(e);
            }
          });
        });
      } catch (e) {
        console.error('Error initializing app:', e);
        showMessage('Failed to initialize admin panel', 'error');
      }
    };

    // User Console Control Functions
    const testConsoleFilter = () => {
      const hideLogs = $('#hideUserConsoleLogs')?.checked;
      const enableFilter = $('#enableUserConsoleFilter')?.checked;
      
      if (hideLogs) {
        showMessage('Testing console filter - check your browser console to see the effect', 'info');
        
        // Test the filter
        if (enableFilter) {
          const filterLog = $('#filterConsoleLog')?.checked;
          const filterWarn = $('#filterConsoleWarn')?.checked;
          const filterError = $('#filterConsoleError')?.checked;
          const filterInfo = $('#filterConsoleInfo')?.checked;
          const filterDebug = $('#filterConsoleDebug')?.checked;
          
          if (filterLog) console.log('This log message should be hidden');
          if (filterWarn) console.warn('This warning should be hidden');
          if (filterError) console.error('This error should be hidden');
          if (filterInfo) console.info('This info should be hidden');
          if (filterDebug) console.debug('This debug should be hidden');
          
          showMessage(`Console filter test completed. Check console for ${filterLog + filterWarn + filterError + filterInfo + filterDebug} hidden messages.`, 'success');
        } else {
          console.log('Console filtering is disabled - all messages visible');
          showMessage('Console filtering is disabled - all messages are visible', 'warning');
        }
      } else {
        showMessage('User console hiding is disabled - no filtering applied', 'warning');
      }
      
      // Apply the current filter settings to admin console
      applyAdminConsoleFilter();
    };

    const resetConsoleFilter = () => {
      if ($('#hideUserConsoleLogs')) $('#hideUserConsoleLogs').checked = false;
      if ($('#enableUserConsoleFilter')) $('#enableUserConsoleFilter').checked = false;
      if ($('#filterConsoleLog')) $('#filterConsoleLog').checked = true;
      if ($('#filterConsoleWarn')) $('#filterConsoleWarn').checked = true;
      if ($('#filterConsoleError')) $('#filterConsoleError').checked = true;
      if ($('#filterConsoleInfo')) $('#filterConsoleInfo').checked = true;
      if ($('#filterConsoleDebug')) $('#filterConsoleDebug').checked = true;
      
      showMessage('Console filter settings reset to default', 'success');
    };

    // Initialize Console Control Settings
    const initializeConsoleControl = () => {
      const hideUserConsoleLogs = $('#hideUserConsoleLogs');
      const enableUserConsoleFilter = $('#enableUserConsoleFilter');
      const consoleFilterOptions = $('#consoleFilterOptions');
      
      if (hideUserConsoleLogs && enableUserConsoleFilter && consoleFilterOptions) {
        // Load saved settings
        const savedHideLogs = localStorage.getItem('adminHideUserConsoleLogs') === 'true';
        const savedEnableFilter = localStorage.getItem('adminEnableUserConsoleFilter') === 'true';
        const savedFilterLog = localStorage.getItem('adminFilterConsoleLog') !== 'false';
        const savedFilterWarn = localStorage.getItem('adminFilterConsoleWarn') !== 'false';
        const savedFilterError = localStorage.getItem('adminFilterConsoleError') !== 'false';
        const savedFilterInfo = localStorage.getItem('adminFilterConsoleInfo') !== 'false';
        const savedFilterDebug = localStorage.getItem('adminFilterConsoleDebug') !== 'false';
        
        hideUserConsoleLogs.checked = savedHideLogs;
        enableUserConsoleFilter.checked = savedEnableFilter;
        $('#filterConsoleLog').checked = savedFilterLog;
        $('#filterConsoleWarn').checked = savedFilterWarn;
        $('#filterConsoleError').checked = savedFilterError;
        $('#filterConsoleInfo').checked = savedFilterInfo;
        $('#filterConsoleDebug').checked = savedFilterDebug;
        
        // Show/hide filter options based on enable filter checkbox
        consoleFilterOptions.style.display = enableUserConsoleFilter.checked ? 'block' : 'none';
        
        // Event listeners
        hideUserConsoleLogs.addEventListener('change', function() {
          localStorage.setItem('adminHideUserConsoleLogs', this.checked);
          showMessage(`User console logs ${this.checked ? 'hidden' : 'visible'}`, 'success');
          
          // Immediately apply console filtering to admin console for testing
          applyAdminConsoleFilter();
        });
        
        enableUserConsoleFilter.addEventListener('change', function() {
          localStorage.setItem('adminEnableUserConsoleFilter', this.checked);
          consoleFilterOptions.style.display = this.checked ? 'block' : 'none';
          showMessage(`Console filtering ${this.checked ? 'enabled' : 'disabled'}`, 'success');
          
          // Immediately apply console filtering to admin console for testing
          applyAdminConsoleFilter();
        });
        
        // Individual filter checkboxes
        $('#filterConsoleLog').addEventListener('change', function() {
          localStorage.setItem('adminFilterConsoleLog', this.checked);
          applyAdminConsoleFilter();
        });
        
        $('#filterConsoleWarn').addEventListener('change', function() {
          localStorage.setItem('adminFilterConsoleWarn', this.checked);
          applyAdminConsoleFilter();
        });
        
        $('#filterConsoleError').addEventListener('change', function() {
          localStorage.setItem('adminFilterConsoleError', this.checked);
          applyAdminConsoleFilter();
        });
        
        $('#filterConsoleInfo').addEventListener('change', function() {
          localStorage.setItem('adminFilterConsoleInfo', this.checked);
          applyAdminConsoleFilter();
        });
        
        $('#filterConsoleDebug').addEventListener('change', function() {
          localStorage.setItem('adminFilterConsoleDebug', this.checked);
          applyAdminConsoleFilter();
        });
        
        // Add event listener for inject button
        const injectBtn = $('#injectConsoleFilter');
        if (injectBtn) {
          injectBtn.addEventListener('click', injectConsoleFilterToUsers);
        }
        
        // Add event listeners for test and reset buttons
        const testBtn = $('#testConsoleFilter');
        const resetBtn = $('#resetConsoleFilter');
        
        if (testBtn) {
          testBtn.addEventListener('click', testConsoleFilter);
        }
        
        if (resetBtn) {
          resetBtn.addEventListener('click', resetConsoleFilter);
        }
        
        console.log('Console control settings initialized');
        
        // Apply initial console filtering to admin console
        applyAdminConsoleFilter();
      }
    };

    // Function to apply console filtering to admin console for testing
    const applyAdminConsoleFilter = () => {
      // Always store original console methods first (if not already stored)
      if (!window.__originalConsole) {
        window.__originalConsole = {
          log: console.log,
          warn: console.warn,
          error: console.error,
          info: console.info,
          debug: console.debug
        };
      }
      
      const hideLogs = localStorage.getItem('adminHideUserConsoleLogs') === 'true';
      const enableFilter = localStorage.getItem('adminEnableUserConsoleFilter') === 'true';
      
      if (!hideLogs) {
        // Restore admin console if hiding is disabled
        console.log = window.__originalConsole.log;
        console.warn = window.__originalConsole.warn;
        console.error = window.__originalConsole.error;
        console.info = window.__originalConsole.info;
        console.debug = window.__originalConsole.debug;
        
        // Test if console is working
        console.log('✅ Admin console restored successfully!');
        console.log('🔍 Current console filter settings:', {
          hideLogs: localStorage.getItem('adminHideUserConsoleLogs'),
          enableFilter: localStorage.getItem('adminEnableUserConsoleFilter'),
          filterLog: localStorage.getItem('adminFilterConsoleLog'),
          filterWarn: localStorage.getItem('adminFilterConsoleWarn'),
          filterError: localStorage.getItem('adminFilterConsoleError'),
          filterInfo: localStorage.getItem('adminFilterConsoleInfo'),
          filterDebug: localStorage.getItem('adminFilterConsoleDebug')
        });
        return;
      }
      
      if (!enableFilter) {
        // Hide all console methods
        console.log = function() {};
        console.warn = function() {};
        console.error = function() {};
        console.info = function() {};
        console.debug = function() {};
      } else {
        // Apply selective filtering
        const filterLog = localStorage.getItem('adminFilterConsoleLog') !== 'false';
        const filterWarn = localStorage.getItem('adminFilterConsoleWarn') !== 'false';
        const filterError = localStorage.getItem('adminFilterConsoleError') !== 'false';
        const filterInfo = localStorage.getItem('adminFilterConsoleInfo') !== 'false';
        const filterDebug = localStorage.getItem('adminFilterConsoleDebug') !== 'false';
        
        if (filterLog) console.log = function() {};
        if (filterWarn) console.warn = function() {};
        if (filterError) console.error = function() {};
        if (filterInfo) console.info = function() {};
        if (filterDebug) console.debug = function() {};
        
        // Restore non-filtered methods
        if (!filterLog) console.log = window.__originalConsole.log;
        if (!filterWarn) console.warn = window.__originalConsole.warn;
        if (!filterError) console.error = window.__originalConsole.error;
        if (!filterInfo) console.info = window.__originalConsole.info;
        if (!filterDebug) console.debug = window.__originalConsole.debug;
      }
    };

    // Function to inject console filter script into user pages
    const injectConsoleFilterToUsers = async () => {
      try {
        showMessage('Injecting console filter to all user pages...', 'info');
        
        // Get all users
        const usersSnapshot = await db.collection('users').get();
        let injectedCount = 0;
        
        for (const userDoc of usersSnapshot.docs) {
          const userId = userDoc.id;
          const userData = userDoc.data();
          
          // Create a document in userConsoleFilters collection to track injection
          await db.collection('userConsoleFilters').doc(userId).set({
            userId: userId,
            userEmail: userData.email || 'unknown',
            userName: userData.name || 'unknown',
            injectedAt: firebase.firestore.FieldValue.serverTimestamp(),
            adminSettings: {
              hideUserConsoleLogs: localStorage.getItem('adminHideUserConsoleLogs') === 'true',
              enableUserConsoleFilter: localStorage.getItem('adminEnableUserConsoleFilter') === 'true',
              filterConsoleLog: localStorage.getItem('adminFilterConsoleLog') !== 'false',
              filterConsoleWarn: localStorage.getItem('adminFilterConsoleWarn') !== 'false',
              filterConsoleError: localStorage.getItem('adminFilterConsoleError') !== 'false',
              filterConsoleInfo: localStorage.getItem('adminFilterConsoleInfo') !== 'false',
              filterConsoleDebug: localStorage.getItem('adminFilterConsoleDebug') !== 'false'
            }
          });
          
          injectedCount++;
        }
        
        showMessage(`Console filter injected to ${injectedCount} user accounts!`, 'success');
        
        // Also update the global admin settings in Firestore
        await db.collection('adminSettings').doc('consoleControl').set({
          hideUserConsoleLogs: localStorage.getItem('adminHideUserConsoleLogs') === 'true',
          enableUserConsoleFilter: localStorage.getItem('adminEnableUserConsoleFilter') === 'true',
          filterConsoleLog: localStorage.getItem('adminFilterConsoleLog') !== 'false',
          filterConsoleWarn: localStorage.getItem('adminFilterConsoleWarn') !== 'false',
          filterConsoleError: localStorage.getItem('adminFilterConsoleError') !== 'false',
          filterConsoleInfo: localStorage.getItem('adminFilterConsoleInfo') !== 'false',
          filterConsoleDebug: localStorage.getItem('adminFilterConsoleDebug') !== 'false',
          lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Create a global script tag that will be loaded by all users
        const consoleFilterScript = `
          // Admin Console Control - IMMEDIATE & AGGRESSIVE
          (function() {
            'use strict';
            
            // IMMEDIATELY block console methods to prevent any output
            const blockConsoleImmediately = () => {
              // Store original methods if not already stored
              if (!window.__originalConsole) {
                window.__originalConsole = {
                  log: console.log,
                  warn: console.warn,
                  error: console.error,
                  info: console.info,
                  debug: console.debug,
                  trace: console.trace,
                  table: console.table,
                  group: console.group,
                  groupEnd: console.groupEnd,
                  groupCollapsed: console.groupCollapsed,
                  time: console.time,
                  timeEnd: console.timeEnd,
                  timeLog: console.timeLog,
                  count: console.count,
                  countReset: console.countReset,
                  clear: console.clear,
                  dir: console.dir,
                  dirxml: console.dirxml,
                  assert: console.assert,
                  profile: console.profile,
                  profileEnd: console.profileEnd,
                  timeline: console.timeline,
                  timelineEnd: console.timelineEnd
                };
              }
              
              // Block ALL console methods immediately
              console.log = function() {};
              console.warn = function() {};
              console.error = function() {};
              console.info = function() {};
              console.debug = function() {};
              console.trace = function() {};
              console.table = function() {};
              console.group = function() {};
              console.groupEnd = function() {};
              console.groupCollapsed = function() {};
              console.time = function() {};
              console.timeEnd = function() {};
              console.timeLog = function() {};
              console.count = function() {};
              console.countReset = function() {};
              console.clear = function() {};
              console.dir = function() {};
              console.dirxml = function() {};
              console.assert = function() {};
              console.profile = function() {};
              console.profileEnd = function() {};
              console.timeline = function() {};
              console.timelineEnd = function() {};
            };
            
            // Wait for Firebase to be available
            const waitForFirebase = () => {
              return new Promise((resolve) => {
                if (typeof firebase !== 'undefined' && firebase.firestore) {
                  resolve();
                } else {
                  const checkInterval = setInterval(() => {
                    if (typeof firebase !== 'undefined' && firebase.firestore) {
                      clearInterval(checkInterval);
                      resolve();
                    }
                  }, 100);
                  
                  // Timeout after 3 seconds
                  setTimeout(() => {
                    clearInterval(checkInterval);
                    resolve();
                  }, 3000);
                }
              });
            };
            
            // Check admin console settings from Firestore
            const checkAdminConsoleSettings = async () => {
              try {
                await waitForFirebase();
                
                if (typeof firebase !== 'undefined' && firebase.firestore) {
                  const db = firebase.firestore();
                  const consoleControlDoc = await db.collection('adminSettings').doc('consoleControl').get();
                   
                  if (consoleControlDoc.exists) {
                    const settings = consoleControlDoc.data();
                    return {
                      hideUserConsoleLogs: settings.hideUserConsoleLogs || false,
                      enableUserConsoleFilter: settings.enableUserConsoleFilter || false,
                      filterConsoleLog: settings.filterConsoleLog !== false,
                      filterConsoleWarn: settings.filterConsoleWarn !== false,
                      filterConsoleError: settings.filterConsoleError !== false,
                      filterConsoleInfo: settings.filterConsoleInfo !== false,
                      filterConsoleDebug: settings.filterConsoleDebug !== false
                    };
                  }
                }
                return false;
              } catch (error) {
                // Completely silent - no console output at all
                return false;
              }
            };
            
            // Apply console filtering based on admin settings
            const applyConsoleFilter = async () => {
              const settings = await checkAdminConsoleSettings();
               
              if (!settings || !settings.hideUserConsoleLogs) {
                // Restore original console methods if they were previously overridden
                if (window.__originalConsole) {
                  console.log = window.__originalConsole.log;
                  console.warn = window.__originalConsole.warn;
                  console.error = window.__originalConsole.error;
                  console.info = window.__originalConsole.info;
                  console.debug = window.__originalConsole.debug;
                  
                  // Restore other methods
                  if (window.__originalConsole.trace) console.trace = window.__originalConsole.trace;
                  if (window.__originalConsole.table) console.table = window.__originalConsole.table;
                  if (window.__originalConsole.group) console.group = window.__originalConsole.group;
                  if (window.__originalConsole.groupEnd) console.groupEnd = window.__originalConsole.groupEnd;
                  if (window.__originalConsole.groupCollapsed) console.groupCollapsed = window.__originalConsole.groupCollapsed;
                  if (window.__originalConsole.time) console.time = window.__originalConsole.time;
                  if (window.__originalConsole.timeEnd) console.timeEnd = window.__originalConsole.timeEnd;
                  if (window.__originalConsole.timeLog) console.timeLog = window.__originalConsole.timeLog;
                  if (window.__originalConsole.count) console.count = window.__originalConsole.count;
                  if (window.__originalConsole.countReset) console.countReset = window.__originalConsole.countReset;
                  if (window.__originalConsole.clear) console.clear = window.__originalConsole.clear;
                  if (window.__originalConsole.dir) console.dir = window.__originalConsole.dir;
                  if (window.__originalConsole.dirxml) console.dirxml = window.__originalConsole.dirxml;
                  if (window.__originalConsole.assert) console.assert = window.__originalConsole.assert;
                  if (window.__originalConsole.profile) console.profile = window.__originalConsole.profile;
                  if (window.__originalConsole.profileEnd) console.profileEnd = window.__originalConsole.profileEnd;
                  if (window.__originalConsole.timeline) console.timeline = window.__originalConsole.timeline;
                  if (window.__originalConsole.timelineEnd) console.timelineEnd = window.__originalConsole.timelineEnd;
                }
                return; // No filtering needed
              }
               
              if (!settings.enableUserConsoleFilter) {
                // Keep console completely blocked
                // (Already blocked by blockConsoleImmediately)
              } else {
                // Apply selective filtering - restore only non-filtered methods
                if (!settings.filterConsoleLog) console.log = window.__originalConsole.log;
                if (!settings.filterConsoleWarn) console.warn = window.__originalConsole.warn;
                if (!settings.filterConsoleError) console.error = window.__originalConsole.error;
                if (!settings.filterConsoleInfo) console.info = window.__originalConsole.info;
                if (!settings.filterConsoleDebug) console.debug = window.__originalConsole.debug;
              }
               
              // Add restore method for admin use only
              window.__restoreConsole = function() {
                if (window.__originalConsole) {
                  console.log = window.__originalConsole.log;
                  console.warn = window.__originalConsole.warn;
                  console.error = window.__originalConsole.error;
                  console.info = window.__originalConsole.info;
                  console.debug = window.__originalConsole.debug;
                  
                  // Restore other methods if they existed
                  if (window.__originalConsole.trace) console.trace = window.__originalConsole.trace;
                  if (window.__originalConsole.table) console.table = window.__originalConsole.table;
                  if (window.__originalConsole.group) console.group = window.__originalConsole.group;
                  if (window.__originalConsole.groupEnd) console.groupEnd = window.__originalConsole.groupEnd;
                  if (window.__originalConsole.groupCollapsed) console.groupCollapsed = window.__originalConsole.groupCollapsed;
                  if (window.__originalConsole.time) console.time = window.__originalConsole.time;
                  if (window.__originalConsole.timeEnd) console.timeEnd = window.__originalConsole.timeEnd;
                  if (window.__originalConsole.timeLog) console.timeLog = window.__originalConsole.timeLog;
                  if (window.__originalConsole.count) console.count = window.__originalConsole.count;
                  if (window.__originalConsole.countReset) console.countReset = window.__originalConsole.countReset;
                  if (window.__originalConsole.clear) console.clear = window.__originalConsole.clear;
                  if (window.__originalConsole.dir) console.dir = window.__originalConsole.dir;
                  if (window.__originalConsole.dirxml) console.dirxml = window.__originalConsole.dirxml;
                  if (window.__originalConsole.assert) console.assert = window.__originalConsole.assert;
                  if (window.__originalConsole.profile) console.profile = window.__originalConsole.profile;
                  if (window.__originalConsole.profileEnd) console.profileEnd = window.__originalConsole.profileEnd;
                  if (window.__originalConsole.timeline) console.timeline = window.__originalConsole.timeline;
                  if (window.__originalConsole.timelineEnd) console.timelineEnd = window.__originalConsole.timelineEnd;
                  
                  // Show restoration message
                  console.log('Console restored to normal operation');
                }
              };
            };
            
            // BLOCK CONSOLE IMMEDIATELY - NO DELAY
            blockConsoleImmediately();
            
            // Initialize and check periodically
            const initConsoleFilter = async () => {
              await applyConsoleFilter();
              setInterval(applyConsoleFilter, 5000); // Check every 5 seconds
            };
            
            // Run immediately and also on DOM ready
            initConsoleFilter();
            
            if (document.readyState === 'loading') {
              document.addEventListener('DOMContentLoaded', initConsoleFilter);
            }
          })();
        `;
        
        // Save the script to Firestore for users to access
        await db.collection('adminSettings').doc('consoleFilterScript').set({
          script: consoleFilterScript,
          lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showMessage('Console filter script generated and saved to database!', 'success');
        
      } catch (error) {
        console.error('Error injecting console filter to users:', error);
        showMessage('Error injecting console filter to users', 'error');
      }
    };

    loginForm?.addEventListener('submit', async e => {
      e.preventDefault();
      if (loginSpinner?.style) loginSpinner.style.display = 'block';
      const email = $('#loginEmail')?.value;
      const password = $('#loginPassword')?.value;
      if (!email || !password) {
        showMessage('Please enter email and password', 'error', true);
        if (loginSpinner?.style) loginSpinner.style.display = 'none';
        return;
      }
      console.log('Login attempt:', email);
      try {
        await auth.signInWithEmailAndPassword(email, password);
        showMessage('Login successful!', 'success', true);
      } catch (error) {
        console.error('Login error:', error.message);
        showMessage(`Login failed: ${error.message}`, 'error', true);
        if (loginSpinner?.style) loginSpinner.style.display = 'none';
      }
    });

    logoutBtn?.addEventListener('click', () => {
      auth.signOut().then(() => {
        showMessage('Logged out!', 'success');
      }).catch(e => showMessage(`Logout failed: ${e.message}`, 'error'));
    });

    // Theme Toggle
    themeToggle?.addEventListener('click', () => {
      document.body.classList.toggle('light-theme');
      const img = themeToggle?.querySelector('img');
      if (img) {
        img.src = document.body.classList.contains('light-theme')
          ? 'https://img.icons8.com/ios-filled/50/000000/moon-symbol.png'
          : 'https://img.icons8.com/ios-filled/50/ffffff/sun.png';
      }
      localStorage.setItem('theme', document.body.classList.contains('light-theme') ? 'light' : 'dark');
    });
    if (localStorage.getItem('theme') === 'light') {
      document.body.classList.add('light-theme');
      const img = themeToggle?.querySelector('img');
      if (img) img.src = 'https://img.icons8.com/ios-filled/50/000000/moon-symbol.png';
    }

    // Tab Navigation
    const switchTab = tabName => {
      state.activeTab = tabName;
      $all('nav.sidebar .menu li button').forEach(btn => {
        const isActive = btn.dataset.tab === tabName;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-current', isActive ? 'page' : 'false');
      });
      $all('main.content .tab-content').forEach(s => {
        const isActive = s.id === tabName;
        s.hidden = !isActive;
        s.setAttribute('aria-hidden', !isActive);
        if (isActive) s.focus();
      });
      const renderers = {
        dashboard: renderDashboard,
        users: renderUsers,
        levelIncome: renderLevelIncome,
        rewardRank: renderRewardRank,
        support: renderSupportTickets,
        deposit: renderDeposit,
        roi: renderROI,
        withdrawal: renderWithdrawal,
        userDeposit: renderUserDeposit,
        reports: renderReports,
        contentMgmt: renderContent,
        communication: renderCommunication,
        settings: renderSettings
      };
      try {
        renderers[tabName]?.();
      } catch (e) {
        console.error(`Error rendering tab ${tabName}:`, e);
        showMessage('Failed to load tab content', 'error');
      }
    };

    $all('nav.sidebar .menu li button:not(#logoutBtn)').forEach(btn =>
      btn.addEventListener('click', () => switchTab(btn.dataset.tab))
    );

    $('nav.sidebar .menu')?.addEventListener('keydown', e => {
      const btns = $all('nav.sidebar .menu li button');
      const idx = btns.findIndex(b => b.classList.contains('active'));
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        btns[(idx + 1) % btns.length].focus();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        btns[(idx - 1 + btns.length) % btns.length].focus();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        btns[idx].click();
      }
    });

    // Notifications
    const loadNotifications = async () => {
      try {
        const snap = await db.collection('notifications').orderBy('createdAt', 'desc').limit(5).get();
        state.notifications = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderDashboard();
      } catch (e) {
        console.error('Error loading notifications:', e);
        showMessage('Failed to load notifications', 'error');
      }
    };

    const clearNotifications = async () => {
      try {
        const batch = db.batch();
        const snap = await db.collection('notifications').get();
        snap.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        state.notifications = [];
        renderDashboard();
        showMessage('Notifications cleared!', 'success');
      } catch (e) {
        console.error('Error clearing notifications:', e);
        showMessage('Failed to clear notifications', 'error');
      }
    };

    // Dashboard
    const loadDashboardStats = async () => {
      try {
        const usersSnapshot = await db.collection('users').get();
        const depositsSnapshot = await db.collection('deposits').where('status', '==', 'approved').get();
        const withdrawalsSnapshot = await db.collection('withdrawals').where('status', '==', 'approved').get();
        const pendingWithdrawalsSnapshot = await db.collection('withdrawals').where('status', '==', 'pending').get();
        const pendingDepositsSnapshot = await db.collection('deposits').where('status', '==', 'pending').get();

        let totalMembers = 0, activeUsers = 0, blockedUsers = 0, todaysIncome = 0;
        let totalDeposits = 0, totalWithdrawals = 0;

        usersSnapshot.forEach(doc => {
          const user = doc.data();
          totalMembers++;
          if (user.isBlocked) blockedUsers++;
          else if (user.isActive) activeUsers++;
        });

        depositsSnapshot.forEach(doc => {
          const deposit = doc.data();
          totalDeposits += deposit.amount || 0;
        });

        withdrawalsSnapshot.forEach(doc => {
          const withdrawal = doc.data();
          totalWithdrawals += withdrawal.amount || 0;
        });

        const netBalance = totalDeposits - totalWithdrawals;

        state.dashboardStats = {
          totalMembers,
          activeUsers,
          blockedUsers,
          todaysIncome,
          pendingWithdrawals: pendingWithdrawalsSnapshot.size,
          pendingDeposits: pendingDepositsSnapshot.size,
          totalDeposits,
          totalWithdrawals,
          netBalance
        };

        // Update UI
        $('#totalMembers').textContent = totalMembers;
        $('#activeUsers').textContent = activeUsers;
        $('#blockedUsers').textContent = blockedUsers;
        $('#todaysIncome').textContent = formatCurrency(todaysIncome);
        $('#pendingWithdrawals').textContent = pendingWithdrawalsSnapshot.size;
        $('#pendingDeposits').textContent = pendingDepositsSnapshot.size;
        $('#companyBalance').textContent = formatCurrency(netBalance);
        $('#totalDeposits').textContent = formatCurrency(totalDeposits);
        $('#totalWithdrawals').textContent = formatCurrency(totalWithdrawals);
        $('#netBalance').textContent = formatCurrency(netBalance);

        if (debugMode) console.log('Dashboard stats loaded:', state.dashboardStats);
      } catch (error) {
        console.error('Error loading dashboard stats:', error);
        showMessage('Error loading dashboard statistics', 'error');
      }
    };

    const renderDashboard = () => {
      try {
        const totalMembers = $('#totalMembers');
        const activeUsers = $('#activeUsers');
        const blockedUsers = $('#blockedUsers');
        const todaysIncome = $('#todaysIncome');
        const pendingWithdrawals = $('#pendingWithdrawals');
        const pendingDeposits = $('#pendingDeposits');
        if (totalMembers) totalMembers.textContent = state.dashboardStats.totalMembers;
        if (activeUsers) activeUsers.textContent = state.dashboardStats.activeUsers;
        if (blockedUsers) blockedUsers.textContent = state.dashboardStats.blockedUsers;
        if (todaysIncome) todaysIncome.textContent = formatCurrency(state.dashboardStats.todaysIncome);
        if (pendingWithdrawals) pendingWithdrawals.textContent = state.dashboardStats.pendingWithdrawals;
        if (pendingDeposits) pendingDeposits.textContent = state.dashboardStats.pendingDeposits;

        const tbody = $('#businessStatsTableBody');
        if (tbody) {
          tbody.innerHTML = '';
          for (let i = 1; i <= 25; i++) {
            tbody.appendChild(createElement('tr', {},
              createElement('td', {}, `Level ${i}`),
              createElement('td', {}, formatCurrency(1000 * i * 1.2)),
              createElement('td', {}, `${50 + i}`)
            ));
          }
        }

        const notes = $('#notificationsList');
        if (notes) {
          notes.innerHTML = '';
          state.notifications.forEach(note => {
            if (typeof note.message === 'string' && note.message.trim()) {
              notes.appendChild(createElement('li', {}, `${note.user}: ${note.message} (${formatDate(note.createdAt?.toDate())})`));
            }
          });
        }

        if (window.Chart) {
          const incomeTrendsCtx = $('#incomeTrendsChart')?.getContext('2d');
          if (incomeTrendsCtx) {
            if (window.incomeTrendsChartInstance) {
              window.incomeTrendsChartInstance.destroy();
            }
            window.incomeTrendsChartInstance = new Chart(incomeTrendsCtx, {
              type: 'line',
              data: {
                labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                datasets: [{
                  label: 'Income Trends',
                  data: [1000, 1500, 1200, 1800, 2000, 2500],
                  borderColor: '#4a59a9',
                  fill: false
                }]
              },
              options: { responsive: true }
            });
          }

          const userGrowthCtx = $('#userGrowthChart')?.getContext('2d');
          if (userGrowthCtx) {
            if (window.userGrowthChartInstance) {
              window.userGrowthChartInstance.destroy();
            }
            window.userGrowthChartInstance = new Chart(userGrowthCtx, {
              type: 'bar',
              data: {
                labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                datasets: [{
                  label: 'User Growth',
                  data: [50, 100, 150, 200, 250, 300],
                  backgroundColor: '#4a59a9'
                }]
              },
              options: { responsive: true }
            });
          }
        }
      } catch (e) {
        console.error('Error rendering dashboard:', e);
        showMessage('Failed to render dashboard', 'error');
      }
    };

    $('#exportReport')?.addEventListener('click', () => {
      try {
        const csv = [
          ['Metric', 'Value'],
          ['Total Members', state.dashboardStats.totalMembers],
          ['Active Users', state.dashboardStats.activeUsers],
          ['Blocked Users', state.dashboardStats.blockedUsers],
          ['Today\'s Income', formatCurrency(state.dashboardStats.todaysIncome)],
          ['Pending Withdrawals', state.dashboardStats.pendingWithdrawals],
          ['Pending Deposits', state.dashboardStats.pendingDeposits]
        ].map(row => row.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = createElement('a', { href: url, download: 'dashboard_stats.csv' });
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        showMessage('Error exporting report', 'error');
      }
    });

    $('#clearNotifications')?.addEventListener('click', clearNotifications);

    $('#refreshData')?.addEventListener('click', () => {
      loadDashboardStats();
      loadNotifications();
      showMessage('Data refreshed', 'success');
    });

    // Users
    const loadUsers = async () => {
      try {
        const snap = await db.collection('users').get();
        const users = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Filter users to show only those who have submitted KYC requests
        const usersWithKYC = [];
        for (const user of users) {
          try {
            const kycDoc = await db.collection('kyc').doc(user.id).get();
            if (kycDoc.exists) {
              const kycData = kycDoc.data();
              usersWithKYC.push({
                ...user,
                kycData: kycData,
                displayUserId: user.userId || user.firebaseUid || user.id.substring(0, 8) // Show 8-digit ID if available
              });
            }
          } catch (error) {
            console.error(`Error fetching KYC for user ${user.id}:`, error);
          }
        }
        
        state.userList = usersWithKYC;
        renderUsers();
        renderUserTree();
      } catch (e) {
        console.error('Error loading users:', e);
        showMessage('Failed to load users', 'error');
      }
    };

    const addUser = () => {
      const modal = createElement('div', { class: 'modal', style: 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center;' },
        createElement('div', { class: 'modal-content', style: 'background: #2a2f4a; padding: 20px; border-radius: 10px; max-width: 400px;' },
          createElement('h3', {}, 'Add New User'),
          createElement('form', { id: 'addUserForm' },
            createElement('div', {}, createElement('label', { for: 'newUserEmail' }, 'Email:'), createElement('input', { type: 'email', id: 'newUserEmail', required: true })),
            createElement('div', {}, createElement('label', { for: 'newUserName' }, 'Name:'), createElement('input', { type: 'text', id: 'newUserName', required: true })),
            createElement('div', {}, createElement('label', { for: 'newUserCountry' }, 'Country:'), createElement('input', { type: 'text', id: 'newUserCountry' })),
            createElement('div', {}, createElement('label', { for: 'newUserPassword' }, 'Password:'), createElement('input', { type: 'password', id: 'newUserPassword', required: true })),
            createElement('div', {}, createElement('label', { for: 'newUserReferrerId' }, 'Referrer ID:'), createElement('input', { type: 'text', id: 'newUserReferrerId' })),
            createElement('button', { type: 'submit', class: 'primary' }, 'Add User'),
            createElement('button', { type: 'button', class: 'secondary', onclick: () => modal.remove() }, 'Cancel')
          )
        )
      );
      document.body.appendChild(modal);
      $('#addUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = $('#newUserEmail').value;
        const name = DOMPurify ? DOMPurify.sanitize($('#newUserName').value) : $('#newUserName').value;
        const country = DOMPurify ? DOMPurify.sanitize($('#newUserCountry').value) : $('#newUserCountry').value;
        const password = $('#newUserPassword').value;
        const referrerId = DOMPurify ? DOMPurify.sanitize($('#newUserReferrerId').value) : $('#newUserReferrerId').value;
        try {
          const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
          const newUserId = Math.floor(10000000 + Math.random() * 90000000).toString(); // Generate 8-digit ID
          await db.collection('users').doc(userCredential.user.uid).set({
            name,
            country,
            status: 'Active',
            isBlocked: false,
            joinDate: new Date().toISOString().slice(0, 10),
            referrerId: referrerId || null,
            balance: 0,
            kycDetails: { status: 'Pending', documentType: '', documentNumber: '', fileUrl: '' },
            userId: newUserId, // 8-digit user ID
            firebaseUid: userCredential.user.uid, // Keep Firebase UID for reference
            referralCode: newUserId, // Use 8-digit ID as referral code
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          await db.collection('notifications').add({
            message: `Welcome to TheOneWealthWave! Your account has been created.`,
            user: email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          showMessage('User added successfully!', 'success');
          loadUsers();
          modal.remove();
        } catch (e) {
          showMessage(`Error adding user: ${e.message}`, 'error');
        }
      });
    };

    const editUser = (user) => {
      const modal = createElement('div', { class: 'modal', style: 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center;' },
        createElement('div', { class: 'modal-content', style: 'background: #2a2f4a; padding: 20px; border-radius: 10px; max-width: 400px;' },
          createElement('h3', {}, `Edit User: ${user.name || user.email}`),
          createElement('form', { id: 'editUserForm' },
            createElement('div', {}, createElement('label', { for: 'editUserName' }, 'Name:'), createElement('input', { type: 'text', id: 'editUserName', value: user.name || '' })),
            createElement('div', {}, createElement('label', { for: 'editUserEmail' }, 'Email:'), createElement('input', { type: 'email', id: 'editUserEmail', value: user.email || '' })),
            createElement('div', {}, createElement('label', { for: 'editUserCountry' }, 'Country:'), createElement('input', { type: 'text', id: 'editUserCountry', value: user.country || '' })),
            createElement('div', {}, createElement('label', { for: 'editUserReferrerId' }, 'Referrer ID:'), createElement('input', { type: 'text', id: 'editUserReferrerId', value: user.referrerId || '' })),
            createElement('div', {}, createElement('label', { for: 'editUserBalance' }, 'Balance ($):'), createElement('input', { type: 'number', id: 'editUserBalance', value: user.balance || 0, step: '0.01' })),
            createElement('div', {}, createElement('label', { for: 'editUserStatus' }, 'Status:'), createElement('select', { id: 'editUserStatus' },
              createElement('option', { value: 'Active' }, 'Active'),
              createElement('option', { value: 'Inactive' }, 'Inactive')
            )),
            createElement('button', { type: 'submit', class: 'primary' }, 'Save Changes'),
            createElement('button', { type: 'button', class: 'secondary', onclick: () => modal.remove() }, 'Cancel')
          )
        )
      );
      document.body.appendChild(modal);
      $('#editUserStatus').value = user.status || 'Active';
      $('#editUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const name = DOMPurify ? DOMPurify.sanitize($('#editUserName').value) : $('#editUserName').value;
          const email = DOMPurify ? DOMPurify.sanitize($('#editUserEmail').value) : $('#editUserEmail').value;
          const country = DOMPurify ? DOMPurify.sanitize($('#editUserCountry').value) : $('#editUserCountry').value;
          const referrerId = DOMPurify ? DOMPurify.sanitize($('#editUserReferrerId').value) : $('#editUserReferrerId').value;
          const balance = parseFloat($('#editUserBalance').value) || 0;
          await db.collection('users').doc(user.id).update({
            name,
            email,
            country,
            referrerId: referrerId || null,
            balance,
            status: $('#editUserStatus').value,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          await db.collection('notifications').add({
            message: `Your profile has been updated by admin. Status: ${$('#editUserStatus').value}`,
            user: user.email || user.id,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          showMessage('User updated successfully!', 'success');
          loadUsers();
          modal.remove();
        } catch (e) {
          showMessage(`Error updating user: ${e.message}`, 'error');
        }
      });
    };

    const toggleBlockUser = async (user) => {
      try {
        const newStatus = !user.isBlocked;
        await db.collection('users').doc(user.id).update({
          isBlocked: newStatus,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        await db.collection('notifications').add({
          message: `Your account has been ${newStatus ? 'blocked' : 'unblocked'} by admin.`,
          user: user.email || user.id,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        state.userList = state.userList.map(u => u.id === user.id ? { ...u, isBlocked: newStatus } : u);
        renderUsers();
        showMessage(`User ${newStatus ? 'blocked' : 'unblocked'} successfully`, 'success');
      } catch (e) {
        showMessage(`Error updating block status: ${e.message}`, 'error');
      }
    };

    const viewKycDetails = async (user) => {
      const modal = $('#kycDetailsModal');
      const content = $('#kycDetailsContent');
      if (modal && content) {
        content.innerHTML = '';
        
        // Use the enhanced KYC data from user object
        const kyc = user.kycData || { status: 'Pending' };
        
        // Create a comprehensive KYC details view
        const detailsContainer = createElement('div', { style: 'max-height: 70vh; overflow-y: auto;' });
        
        // User Information Section (at the top)
        const userSection = createElement('div', { style: 'margin-bottom: 20px; padding: 15px; background: rgba(0,210,255,0.1); border-radius: 10px; border-left: 4px solid var(--accent);' });
        userSection.appendChild(createElement('h3', { style: 'color: var(--accent); margin-bottom: 10px;' }, 'User Information'));
        userSection.appendChild(createElement('p', { style: 'font-weight: bold;' }, `Name: ${DOMPurify ? DOMPurify.sanitize(user.name) : user.name || 'N/A'}`));
        userSection.appendChild(createElement('p', { style: 'font-weight: bold;' }, `Email: ${DOMPurify ? DOMPurify.sanitize(user.email) : user.email || 'N/A'}`));
        userSection.appendChild(createElement('p', { style: 'font-weight: bold;' }, `User ID: ${user.displayUserId || user.userId || 'N/A'}`));
        detailsContainer.appendChild(userSection);
        
        // Personal Information Section
        const personalSection = createElement('div', { style: 'margin-bottom: 20px;' });
        personalSection.appendChild(createElement('h3', { style: 'color: var(--accent); margin-bottom: 10px;' }, 'Personal Information'));
        personalSection.appendChild(createElement('p', {}, `Name: ${DOMPurify ? DOMPurify.sanitize(kyc.name) : kyc.name || 'N/A'}`));
        personalSection.appendChild(createElement('p', {}, `Mobile: ${DOMPurify ? DOMPurify.sanitize(kyc.mobile) : kyc.mobile || 'N/A'}`));
        personalSection.appendChild(createElement('p', {}, `Aadhaar: ${DOMPurify ? DOMPurify.sanitize(kyc.aadhaar) : kyc.aadhaar || 'N/A'}`));
        personalSection.appendChild(createElement('p', {}, `PAN: ${DOMPurify ? DOMPurify.sanitize(kyc.pan) : kyc.pan || 'N/A'}`));
        personalSection.appendChild(createElement('p', {}, `Address: ${DOMPurify ? DOMPurify.sanitize(kyc.address) : kyc.address || 'N/A'}`));
        detailsContainer.appendChild(personalSection);
        
        // Banking Information Section
        const bankingSection = createElement('div', { style: 'margin-bottom: 20px;' });
        bankingSection.appendChild(createElement('h3', { style: 'color: var(--accent); margin-bottom: 10px;' }, 'Banking Information'));
        bankingSection.appendChild(createElement('p', {}, `Account Holder: ${DOMPurify ? DOMPurify.sanitize(kyc.accountHolder) : kyc.accountHolder || 'N/A'}`));
        bankingSection.appendChild(createElement('p', {}, `Bank Name: ${DOMPurify ? DOMPurify.sanitize(kyc.bankName) : kyc.bankName || 'N/A'}`));
        bankingSection.appendChild(createElement('p', {}, `IFSC Code: ${DOMPurify ? DOMPurify.sanitize(kyc.ifsc) : kyc.ifsc || 'N/A'}`));
        bankingSection.appendChild(createElement('p', {}, `Branch: ${DOMPurify ? DOMPurify.sanitize(kyc.branch) : kyc.branch || 'N/A'}`));
        bankingSection.appendChild(createElement('p', {}, `Account Number: ${DOMPurify ? DOMPurify.sanitize(kyc.accountNumber) : kyc.accountNumber || 'N/A'}`));
        bankingSection.appendChild(createElement('p', {}, `UPI ID: ${DOMPurify ? DOMPurify.sanitize(kyc.upi) : kyc.upi || 'N/A'}`));
        bankingSection.appendChild(createElement('p', {}, `USDT BEP20: ${DOMPurify ? DOMPurify.sanitize(kyc.usdtBep20) : kyc.usdtBep20 || 'N/A'}`));
        detailsContainer.appendChild(bankingSection);
        
        // Status Section
        const statusSection = createElement('div', { style: 'margin-bottom: 20px;' });
        statusSection.appendChild(createElement('h3', { style: 'color: var(--accent); margin-bottom: 10px;' }, 'KYC Status'));
        const statusBadge = createElement('span', { 
          class: `badge ${kyc.status === 'approved' ? 'success' : kyc.status === 'rejected' ? 'danger' : 'primary'}`,
          style: 'padding: 5px 10px; border-radius: 15px; font-size: 12px;'
        }, kyc.status?.charAt(0).toUpperCase() + kyc.status?.slice(1) || 'Pending');
        statusSection.appendChild(createElement('p', {}, 'Status: ', statusBadge));
        
        // Show KYC submission date
        if (kyc.submittedAt) {
          statusSection.appendChild(createElement('p', { style: 'font-weight: bold; color: var(--accent);' }, `Submitted Date: ${formatDate(kyc.submittedAt)}`));
        }
        
        // Show KYC request date (when user first requested KYC)
        if (kyc.requestedAt) {
          statusSection.appendChild(createElement('p', { style: 'font-weight: bold; color: var(--accent);' }, `Request Date: ${formatDate(kyc.requestedAt)}`));
        }
        
        detailsContainer.appendChild(statusSection);
        
        // Action Buttons Section (only show if KYC is pending)
        if (kyc.status === 'pending' || kyc.status === 'submitted') {
          const actionSection = createElement('div', { style: 'margin-bottom: 20px; text-align: center;' });
          actionSection.appendChild(createElement('h3', { style: 'color: var(--accent); margin-bottom: 15px;' }, 'KYC Actions'));
          
          const approveBtn = createElement('button', {
            style: 'background: var(--accent); color: white; border: none; padding: 10px 20px; border-radius: 5px; margin-right: 10px; cursor: pointer;',
            onclick: () => approveKyc(user.id, user.email)
          }, 'Approve KYC');
          
          const rejectBtn = createElement('button', {
            style: 'background: var(--danger); color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;',
            onclick: () => rejectKyc(user.id, user.email)
          }, 'Reject KYC');
          
          actionSection.appendChild(approveBtn);
          actionSection.appendChild(rejectBtn);
          detailsContainer.appendChild(actionSection);
        }
        
        // Documents Section
        const documentsSection = createElement('div', { style: 'margin-bottom: 20px;' });
        documentsSection.appendChild(createElement('h3', { style: 'color: var(--accent); margin-bottom: 10px;' }, 'Documents & Media'));
        
        const documentFields = [
          { key: 'kycAadhaarFrontUrl', label: 'Aadhaar Front' },
          { key: 'kycAadhaarBackUrl', label: 'Aadhaar Back' },
          { key: 'kycPanFrontUrl', label: 'PAN Front' },
          { key: 'kycPassbookUrl', label: 'Bank Passbook' },
          { key: 'kycSelfieUrl', label: 'Selfie Photo' },
          { key: 'kycVideoUrl', label: 'Selfie Video' }
        ];
        
        documentFields.forEach(field => {
          if (kyc[field.key]) {
            const docContainer = createElement('div', { style: 'margin-bottom: 15px;' });
            docContainer.appendChild(createElement('p', { style: 'font-weight: bold; margin-bottom: 5px;' }, field.label));
            
            if (field.key.includes('Video')) {
              // Video element
              const video = createElement('video', { 
                controls: true, 
                style: 'max-width: 100%; max-height: 200px; border-radius: 5px;',
                src: DOMPurify ? DOMPurify.sanitize(kyc[field.key]) : kyc[field.key]
              });
              docContainer.appendChild(video);
        } else {
              // Image element
              const img = createElement('img', { 
                style: 'max-width: 100%; max-height: 200px; border-radius: 5px; cursor: pointer;',
                src: DOMPurify ? DOMPurify.sanitize(kyc[field.key]) : kyc[field.key],
                alt: field.label,
                onclick: () => {
                  const fullScreenModal = createElement('div', {
                    style: 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); display: flex; align-items: center; justify-content: center; z-index: 10000;'
                  });
                  const fullScreenImg = createElement('img', {
                    style: 'max-width: 90%; max-height: 90%; object-fit: contain;',
                    src: DOMPurify ? DOMPurify.sanitize(kyc[field.key]) : kyc[field.key],
                    alt: field.label
                  });
                  fullScreenModal.appendChild(fullScreenImg);
                  fullScreenModal.onclick = () => fullScreenModal.remove();
                  document.body.appendChild(fullScreenModal);
                }
              });
              docContainer.appendChild(img);
            }
            
            // Download link
            const downloadLink = createElement('a', {
              href: DOMPurify ? DOMPurify.sanitize(kyc[field.key]) : kyc[field.key],
              download: `${field.label}_${user.name || user.email}.${field.key.includes('Video') ? 'mp4' : 'jpg'}`,
              style: 'display: block; margin-top: 5px; color: var(--accent); text-decoration: none; font-size: 12px;'
            }, 'Download');
            docContainer.appendChild(downloadLink);
            
            documentsSection.appendChild(docContainer);
          }
        });
        
        if (!documentFields.some(field => kyc[field.key])) {
          documentsSection.appendChild(createElement('p', { style: 'color: #888;' }, 'No documents uploaded'));
        }
        
        detailsContainer.appendChild(documentsSection);
        
        // KYC History Section
        const historySection = createElement('div', { style: 'margin-bottom: 20px;' });
        historySection.appendChild(createElement('h3', { style: 'color: var(--accent); margin-bottom: 10px;' }, 'KYC History'));
        
        try {
          const historySnapshot = await db.collection('kyc').doc(user.id).collection('history').orderBy('createdAt', 'desc').limit(10).get();
          
          if (historySnapshot.empty) {
            historySection.appendChild(createElement('p', { style: 'color: #888;' }, 'No KYC history available'));
          } else {
            const historyTable = createElement('table', { style: 'width: 100%; border-collapse: collapse; margin-top: 10px;' });
            
            // Table header
            const thead = createElement('thead');
            thead.appendChild(createElement('tr', {},
              createElement('th', { style: 'padding: 8px; text-align: left; border-bottom: 1px solid #ddd;' }, 'Date'),
              createElement('th', { style: 'padding: 8px; text-align: left; border-bottom: 1px solid #ddd;' }, 'Status'),
              createElement('th', { style: 'padding: 8px; text-align: left; border-bottom: 1px solid #ddd;' }, 'Remarks')
            ));
            historyTable.appendChild(thead);
            
            // Table body
            const tbody = createElement('tbody');
            historySnapshot.docs.forEach(doc => {
              const history = doc.data();
              const row = createElement('tr', {},
                createElement('td', { style: 'padding: 8px; border-bottom: 1px solid #eee;' }, formatDate(history.createdAt)),
                createElement('td', { style: 'padding: 8px; border-bottom: 1px solid #eee;' }, 
                  createElement('span', { 
                    class: `badge ${history.status === 'approved' ? 'success' : history.status === 'rejected' ? 'danger' : 'primary'}`,
                    style: 'padding: 2px 6px; border-radius: 10px; font-size: 10px;'
                  }, history.status?.charAt(0).toUpperCase() + history.status?.slice(1) || 'Updated')
                ),
                createElement('td', { style: 'padding: 8px; border-bottom: 1px solid #eee;' }, history.remarks || 'No remarks')
              );
              tbody.appendChild(row);
            });
            historyTable.appendChild(tbody);
            historySection.appendChild(historyTable);
          }
        } catch (error) {
          console.error('Error loading KYC history:', error);
          historySection.appendChild(createElement('p', { style: 'color: #888;' }, 'Error loading KYC history'));
        }
        
        detailsContainer.appendChild(historySection);
        
        content.appendChild(detailsContainer);
        
        // Action buttons
        const actionButtons = createElement('div', { style: 'margin-top: 20px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;' });
        
        // Edit KYC button (always available for admin)
        actionButtons.appendChild(createElement('button', {
          class: 'primary',
          onclick: () => editKycDetails(user)
        }, 'Edit KYC'));
        
        if (kyc.status === 'pending') {
          actionButtons.appendChild(createElement('button', {
            class: 'success',
            onclick: () => approveKyc(user.id, user.email || user.id)
          }, 'Approve KYC'));
          actionButtons.appendChild(createElement('button', {
            class: 'danger',
            onclick: () => rejectKyc(user.id, user.email || user.id)
          }, 'Reject KYC'));
        } else if (kyc.status === 'approved') {
          actionButtons.appendChild(createElement('button', {
            class: 'danger',
            onclick: () => rejectKyc(user.id, user.email || user.id)
          }, 'Reject KYC'));
        } else if (kyc.status === 'rejected') {
          actionButtons.appendChild(createElement('button', {
            class: 'success',
            onclick: () => approveKyc(user.id, user.email || user.id)
          }, 'Approve KYC'));
        }
        
        content.appendChild(actionButtons);
        modal.style.display = 'flex';
      }
    };

    const closeKycModal = () => {
      const modal = $('#kycDetailsModal');
      if (modal) modal.style.display = 'none';
    };

    const editKycDetails = (user) => {
      const modal = $('#kycDetailsModal');
      const content = $('#kycDetailsContent');
      if (modal && content) {
        content.innerHTML = '';
        
        const kyc = user.kycData || {};
        
        // Create edit form
        const editForm = createElement('form', { 
          style: 'max-height: 70vh; overflow-y: auto; padding: 20px;',
          onsubmit: (e) => {
            e.preventDefault();
            saveKycChanges(user.id, editForm);
          }
        });
        
        // Personal Information Section
        const personalSection = createElement('div', { style: 'margin-bottom: 20px;' });
        personalSection.appendChild(createElement('h3', { style: 'color: var(--accent); margin-bottom: 15px;' }, 'Personal Information'));
        
        const personalFields = [
          { key: 'name', label: 'Full Name', type: 'text' },
          { key: 'mobile', label: 'Mobile Number', type: 'tel' },
          { key: 'aadhaar', label: 'Aadhaar Number', type: 'text' },
          { key: 'pan', label: 'PAN Number', type: 'text' },
          { key: 'address', label: 'Address', type: 'textarea' }
        ];
        
        personalFields.forEach(field => {
          const fieldContainer = createElement('div', { style: 'margin-bottom: 15px;' });
          fieldContainer.appendChild(createElement('label', { style: 'display: block; margin-bottom: 5px; font-weight: bold;' }, field.label));
          
          if (field.type === 'textarea') {
            fieldContainer.appendChild(createElement('textarea', {
              name: field.key,
              value: kyc[field.key] || '',
              style: 'width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; min-height: 80px;',
              placeholder: `Enter ${field.label.toLowerCase()}`
            }));
          } else {
            fieldContainer.appendChild(createElement('input', {
              type: field.type,
              name: field.key,
              value: kyc[field.key] || '',
              style: 'width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;',
              placeholder: `Enter ${field.label.toLowerCase()}`
            }));
          }
          
          personalSection.appendChild(fieldContainer);
        });
        
        editForm.appendChild(personalSection);
        
        // Banking Information Section
        const bankingSection = createElement('div', { style: 'margin-bottom: 20px;' });
        bankingSection.appendChild(createElement('h3', { style: 'color: var(--accent); margin-bottom: 15px;' }, 'Banking Information'));
        
        const bankingFields = [
          { key: 'accountHolder', label: 'Account Holder Name', type: 'text' },
          { key: 'bankName', label: 'Bank Name', type: 'text' },
          { key: 'ifsc', label: 'IFSC Code', type: 'text' },
          { key: 'branch', label: 'Branch', type: 'text' },
          { key: 'accountNumber', label: 'Account Number', type: 'text' },
          { key: 'upi', label: 'UPI ID', type: 'text' },
          { key: 'usdtBep20', label: 'USDT BEP20 Address', type: 'text' }
        ];
        
        bankingFields.forEach(field => {
          const fieldContainer = createElement('div', { style: 'margin-bottom: 15px;' });
          fieldContainer.appendChild(createElement('label', { style: 'display: block; margin-bottom: 5px; font-weight: bold;' }, field.label));
          fieldContainer.appendChild(createElement('input', {
            type: field.type,
            name: field.key,
            value: kyc[field.key] || '',
            style: 'width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;',
            placeholder: `Enter ${field.label.toLowerCase()}`
          }));
          bankingSection.appendChild(fieldContainer);
        });
        
        editForm.appendChild(bankingSection);
        
        // Status Section
        const statusSection = createElement('div', { style: 'margin-bottom: 20px;' });
        statusSection.appendChild(createElement('h3', { style: 'color: var(--accent); margin-bottom: 15px;' }, 'KYC Status'));
        
        const statusContainer = createElement('div', { style: 'margin-bottom: 15px;' });
        statusContainer.appendChild(createElement('label', { style: 'display: block; margin-bottom: 5px; font-weight: bold;' }, 'Status'));
        statusContainer.appendChild(createElement('select', {
          name: 'status',
          style: 'width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;'
        }, 
          createElement('option', { value: 'pending' }, 'Pending'),
          createElement('option', { value: 'submitted' }, 'Submitted'),
          createElement('option', { value: 'approved' }, 'Approved'),
          createElement('option', { value: 'rejected' }, 'Rejected')
        ));
        
        // Set current status
        const statusSelect = statusContainer.querySelector('select[name="status"]');
        if (statusSelect) {
          statusSelect.value = kyc.status || 'pending';
        }
        
        statusSection.appendChild(statusContainer);
        editForm.appendChild(statusSection);
        
        // Remarks Section
        const remarksSection = createElement('div', { style: 'margin-bottom: 20px;' });
        remarksSection.appendChild(createElement('h3', { style: 'color: var(--accent); margin-bottom: 15px;' }, 'Admin Remarks'));
        
        const remarksContainer = createElement('div', { style: 'margin-bottom: 15px;' });
        remarksContainer.appendChild(createElement('label', { style: 'display: block; margin-bottom: 5px; font-weight: bold;' }, 'Remarks'));
        remarksContainer.appendChild(createElement('textarea', {
          name: 'remarks',
          style: 'width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; min-height: 80px;',
          placeholder: 'Enter any remarks or notes about this KYC'
        }));
        remarksSection.appendChild(remarksContainer);
        editForm.appendChild(remarksSection);
        
        // Action buttons
        const actionButtons = createElement('div', { style: 'margin-top: 20px; display: flex; gap: 10px; justify-content: center;' });
        actionButtons.appendChild(createElement('button', {
          type: 'submit',
          class: 'success',
          style: 'padding: 10px 20px;'
        }, 'Save Changes'));
        actionButtons.appendChild(createElement('button', {
          type: 'button',
          class: 'secondary',
          style: 'padding: 10px 20px;',
          onclick: () => viewKycDetails(user)
        }, 'Cancel'));
        
        editForm.appendChild(actionButtons);
        content.appendChild(editForm);
        modal.style.display = 'flex';
      }
    };

    const saveKycChanges = async (userId, form) => {
      try {
        const formData = new FormData(form);
        const kycData = {};
        
        // Collect all form data
        for (const [key, value] of formData.entries()) {
          if (value.trim()) {
            kycData[key] = value.trim();
          }
        }
        
        // Update KYC document
        await db.collection('kyc').doc(userId).update({
          ...kycData,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedBy: 'admin'
        });
        
        // Add to KYC history
        await db.collection('kyc').doc(userId).collection('history').add({
          status: kycData.status || 'updated',
          remarks: kycData.remarks || 'KYC details updated by admin',
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedBy: 'admin'
        });
        
        // Send notification to user
        await db.collection('notifications').add({
          message: `Your KYC details have been updated by admin. Status: ${kycData.status || 'updated'}`,
          user: userId,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showMessage('KYC details updated successfully', 'success');
        closeKycModal();
        
        // Refresh user list
        await loadUsers();
        renderUsers();
        
      } catch (error) {
        console.error('Error updating KYC:', error);
        showMessage(`Failed to update KYC: ${error.message}`, 'error');
      }
    };

    const approveKyc = async (userId, userEmail) => {
      try {
        if (!confirm(`Approve KYC for ${userEmail}?`)) return;
        
        // Update KYC status in the kyc collection
        await db.collection('kyc').doc(userId).update({
          status: 'approved',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Add to KYC history
        await db.collection('kyc').doc(userId).collection('history').add({
          status: 'approved',
          remarks: 'KYC approved by admin',
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        await db.collection('notifications').add({
          message: `Your KYC has been approved.`,
          user: userEmail,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showMessage(`KYC for ${userEmail} approved!`, 'success');
        loadUsers();
        closeKycModal();
      } catch (e) {
        console.error('Error approving KYC:', e);
        showMessage(`Failed to approve KYC: ${e.message}`, 'error');
      }
    };

    const rejectKyc = async (userId, userEmail) => {
      try {
        if (!confirm(`Reject KYC for ${userEmail}?`)) return;
        
        // Update KYC status in the kyc collection
        await db.collection('kyc').doc(userId).update({
          status: 'rejected',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Add to KYC history
        await db.collection('kyc').doc(userId).collection('history').add({
          status: 'rejected',
          remarks: 'KYC rejected by admin',
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        await db.collection('notifications').add({
          message: `Your KYC has been rejected.`,
          user: userEmail,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showMessage(`KYC for ${userEmail} rejected!`, 'success');
        loadUsers();
        closeKycModal();
      } catch (e) {
        console.error('Error rejecting KYC:', e);
        showMessage(`Failed to reject KYC: ${e.message}`, 'error');
      }
    };

    window.closeKycModal = closeKycModal; // Expose to HTML

    const renderUsers = () => {
      try {
        const tbody = $('#userTableBody');
        const userTreeArea = $('#userTreeArea');
        if (tbody) {
          tbody.innerHTML = '';
          const filter = $('#userSearchInput')?.value?.toLowerCase() || '';
          const kycFilter = $('#kycStatusFilter')?.value || '';
          state.userList
            .filter(u => {
              const matchesSearch = (
                u.name?.toLowerCase?.()?.includes(filter) ||
                u.email?.toLowerCase?.()?.includes(filter) ||
                u.displayUserId?.toLowerCase?.()?.includes(filter) ||
                u.userId?.toLowerCase?.()?.includes(filter)
              );
              
              const matchesKycFilter = !kycFilter || u.kycData?.status === kycFilter;
              
              return matchesSearch && matchesKycFilter;
            })
            .forEach(u => {
              const row = createElement('tr', { class: u.isBlocked ? 'blocked' : '' },
                createElement('td', {}, u.displayUserId || u.userId || '-'),
                createElement('td', {}, DOMPurify ? DOMPurify.sanitize(u.name) : u.name || '-'),
                createElement('td', {}, DOMPurify ? DOMPurify.sanitize(u.email) : u.email || '-'),
                createElement('td', {}, u.referrerId || '-'),
                createElement('td', {}, formatCurrency(u.balance || 0)),
                createElement('td', {}, u.isBlocked ? 'Blocked' : u.status || 'Active'),
                createElement('td', {}, u.kycData?.status?.charAt(0).toUpperCase() + u.kycData?.status?.slice(1) || 'Pending'),
                createElement('td', {}, u.kycData?.submittedAt ? formatDate(u.kycData.submittedAt) : 'Not Submitted'),
                createElement('td', {},
                  createElement('button', { class: 'small primary', onclick: () => editUser(u) }, 'Edit'),
                  createElement('button', { class: 'small primary', onclick: () => viewKycDetails(u) }, 'View KYC'),
                  createElement('button', { class: 'small danger', onclick: async () => {
                    if (confirm(`Delete ${u.name || u.email}?`)) {
                      try {
                        await db.collection('users').doc(u.id).delete();
                        await db.collection('notifications').add({
                          message: `Your account has been deleted by admin.`,
                          user: u.email || u.id,
                          createdAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                        state.userList = state.userList.filter(user => user.id !== u.id);
                        renderUsers();
                        showMessage('User deleted', 'success');
                      } catch (e) {
                        showMessage(`Error deleting user: ${e.message}`, 'error');
                      }
                    }
                  } }, 'Delete'),
                  createElement('button', { class: `small ${u.isBlocked ? 'success' : 'warning'}`, onclick: () => toggleBlockUser(u) }, u.isBlocked ? 'Unblock' : 'Block')
                )
              );
              tbody.appendChild(row);
            });
        }
        if (userTreeArea) {
          userTreeArea.innerHTML = '<p>Loading referral tree...</p>';
        }
      } catch (e) {
        console.error('Error rendering users:', e);
        showMessage('Failed to render users', 'error');
      }
    };

    const renderUserTree = async () => {
      try {
        const userTreeArea = $('#userTreeArea');
        if (userTreeArea) {
          userTreeArea.innerHTML = '';
          const nodes = [];
          const edges = [];
          const snap = await db.collection('users').get();
          snap.forEach(doc => {
            const user = doc.data();
            nodes.push({ id: doc.id, label: user.name || user.email });
            if (user.referrerId) {
              edges.push({ from: user.referrerId, to: doc.id });
            }
          });
          const container = userTreeArea;
          const data = { nodes: new vis.DataSet(nodes), edges: new vis.DataSet(edges) };
          const options = { layout: { hierarchical: { direction: 'UD' } } };
          new vis.Network(container, data, options);
        }
      } catch (e) {
        console.error('Error rendering user tree:', e);
        showMessage('Failed to render user tree', 'error');
        $('#userTreeArea').innerHTML = '<p>Failed to load referral tree.</p>';
      }
    };

    $('#addUserBtn')?.addEventListener('click', addUser);
    $('#userSearchInput')?.addEventListener('input', renderUsers);
    $('#kycStatusFilter')?.addEventListener('change', renderUsers);

    // Level Income
    const levelIncomeTableBody = $('#levelIncomeTable tbody');
    const initLevelIncome = async () => {
      try {
        const docSnap = await db.collection('settings').doc('levelIncomeList').get();
        if (docSnap.exists) {
          state.levelIncomeList = docSnap.data().levels || [];
        }
        if (!state.levelIncomeList.length) {
          for (let i = 1; i <= 25; i++) {
            state.levelIncomeList.push({
              level: i,
              incomePercent: 0,
              selfInvestmentCondition: 0,
              totalTeamBusinessCondition: 0,
              totalTeamSizeCondition: 0,
              blocked: false
            });
          }
          await db.collection('settings').doc('levelIncomeList').set({ levels: state.levelIncomeList });
        }
        renderLevelIncome();
      } catch (e) {
        console.error('Error initializing levelIncomeList:', e);
        showMessage('Failed to load level income settings', 'error');
      }
    };

    const renderLevelIncome = () => {
      try {
        if (levelIncomeTableBody) {
          levelIncomeTableBody.innerHTML = '';
          state.levelIncomeList.forEach(item => {
            const tr = createElement('tr', { class: item.blocked ? 'blocked' : '' },
              createEditableCell(item.level, null, true),
              createEditableNumberCell(item.incomePercent, v => {
                item.incomePercent = Math.max(0, Math.min(v, 100));
                renderSummary();
              }, 0, 100, 0.01),
              createEditableNumberCell(item.selfInvestmentCondition, v => {
                item.selfInvestmentCondition = Math.max(0, v);
              }, 0),
              createEditableNumberCell(item.totalTeamBusinessCondition, v => {
                item.totalTeamBusinessCondition = Math.max(0, v);
              }, 0),
              createEditableNumberCell(item.totalTeamSizeCondition, v => {
                item.totalTeamSizeCondition = Math.max(0, v);
              }, 0),
              createElement('td', {},
                createElement('button', {
                  class: item.blocked ? 'danger small' : 'secondary small',
                  onclick: () => {
                    item.blocked = !item.blocked;
                    renderLevelIncome();
                  }
                }, item.blocked ? 'Blocked' : 'Active')
              ),
              createElement('td', {},
                createElement('button', {
                  class: 'danger small',
                  onclick: () => {
                    if (state.levelIncomeList.length > 1 && confirm(`Remove Level ${item.level}?`)) {
                      state.levelIncomeList = state.levelIncomeList.filter(l => l.level !== item.level);
                      state.levelIncomeList.forEach((l, i) => l.level = i + 1);
                      renderLevelIncome();
                    }
                  }
                }, 'Remove')
              )
            );
            levelIncomeTableBody.appendChild(tr);
          });
        }
        renderSummary();
      } catch (e) {
        console.error('Error rendering level income:', e);
        showMessage('Failed to render level income', 'error');
      }
    };

    const saveLevelIncome = async () => {
      try {
        await db.collection('settings').doc('levelIncomeList').set({ levels: state.levelIncomeList });
        showMessage('Level Income settings saved!', 'success');
      } catch (e) {
        console.error('Error saving levelIncomeList:', e);
        showMessage('Failed to save level income settings', 'error');
      }
    };

    const createEditableCell = (value, onChange, readOnly = false) => {
      const td = createElement('td', {});
      if (readOnly) {
        td.textContent = value;
      } else {
        const input = createElement('input', { type: 'text', value });
        input.addEventListener('change', e => {
          const sanitizedValue = DOMPurify ? DOMPurify.sanitize(e.target.value) : e.target.value;
          onChange(sanitizedValue);
        });
        td.appendChild(input);
      }
      return td;
    };

    const createEditableNumberCell = (value, onChange, min = null, max = null, step = null) => {
      const td = createElement('td', {});
      const input = createElement('input', { type: 'number', value });
      if (min !== null) input.min = min;
      if (max !== null) input.max = max;
      if (step !== null) input.step = step;
      input.addEventListener('change', e => {
        let v = parseFloat(e.target.value) || 0;
        if (min !== null) v = Math.max(v, min);
        if (max !== null) v = Math.min(v, max);
        e.target.value = v;
        onChange(v);
      });
      td.appendChild(input);
      return td;
    };

    const renderSummary = () => {
      try {
        const totalLevels = $('#liTotalLevels');
        const totalRewardPercent = $('#liTotalRewardPercent');
        if (totalLevels) totalLevels.textContent = state.levelIncomeList.length;
        if (totalRewardPercent) {
          const totalPercent = state.levelIncomeList.reduce((sum, v) => sum + Number(v.incomePercent || 0), 0);
          totalRewardPercent.textContent = totalPercent.toFixed(2) + '%';
        }
      } catch (e) {
        console.error('Error rendering summary:', e);
      }
    };

    $('#btnAddLevelIncome')?.addEventListener('click', () => {
      if (state.levelIncomeList.length >= 30) {
        showMessage('Max 30 levels reached', 'error');
        return;
      }
      state.levelIncomeList.push({
        level: state.levelIncomeList.length + 1,
        incomePercent: 0,
        selfInvestmentCondition: 0,
        totalTeamBusinessCondition: 0,
        totalTeamSizeCondition: 0,
        blocked: false
      });
      renderLevelIncome();
    });

    $('#btnRemoveLevelIncome')?.addEventListener('click', () => {
      if (state.levelIncomeList.length > 1 && confirm('Remove last level?')) {
        state.levelIncomeList.pop();
        renderLevelIncome();
      }
    });

    $('#btnResetLevelIncome')?.addEventListener('click', () => {
      if (confirm('Reset level income data?')) {
        state.levelIncomeList = [];
        initLevelIncome();
      }
    });

    $('#btnSaveLevelIncome')?.addEventListener('click', saveLevelIncome);

    // Income Control for Blocked Users
    const addIncome = async (userId, amount, type, level = null) => {
      try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
          throw new Error('User not found');
        }
        const user = userDoc.data();
        if (user.isBlocked) {
          console.log(`Income addition skipped for blocked user: ${userId}`);
          return;
        }
        const incomeData = {
          userId,
          user: user.email || userId,
          amount,
          type,
          date: new Date().toISOString().slice(0, 10),
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        if (level) incomeData.level = level;
        await db.collection('income').add(incomeData);
        console.log(`Income added for ${userId}: ${formatCurrency(amount)} (${type})`);
      } catch (e) {
        console.error('Error adding income:', e);
      }
    };

    // Calculate Total Business with 50% Rule
    const calculateTotalBusiness = (levelBusinesses) => {
      if (!levelBusinesses || levelBusinesses.length === 0) return 0;
      
      // Find the maximum business line
      const maxBusiness = Math.max(...levelBusinesses);
      
      // Calculate total: 50% from max line + 50% from all other lines
      const otherLinesTotal = levelBusinesses.reduce((sum, business) => sum + business, 0) - maxBusiness;
      const totalBusiness = (maxBusiness * 0.5) + (otherLinesTotal * 0.5);
      
      return Math.round(totalBusiness);
    };

    // Auto-calculate total business based on power leg and other leg
    const autoCalculateTotalBusiness = (item, forceUpdate = false) => {
      const powerLegBusiness = item.powerLegBusiness || 0;
      const otherLegBusiness = item.otherLegBusiness || 0;
      
      // Calculate total: 50% from power leg + 50% from other leg
      const calculatedTotal = Math.round((powerLegBusiness * 0.5) + (otherLegBusiness * 0.5));
      
      // Only update if forced or if total business is not set
      if (forceUpdate || !item.totalBusiness || item.totalBusiness === 0) {
        item.totalBusiness = calculatedTotal;
      }
      
      return item.totalBusiness;
    };

    // Reward & Rank
    const loadRewardRank = async () => {
      try {
        const docSnap = await db.collection('settings').doc('rewardList').get();
        
        if (docSnap.exists) {
          const data = docSnap.data();
          const savedRanks = data.ranks || [];
          
          if (savedRanks.length > 0) {
            // Check if we need to migrate from old structure
            if (!savedRanks[0].powerLegBusiness) {
              // Migrate old structure to new simplified structure
              state.rewardList = savedRanks.map((item, index) => ({
                rank: index + 1,
                totalBusiness: item.totalBusiness || (index + 1) * 1000,
                powerLegBusiness: item.powerLeg || item.level1Business || (index + 1) * 100,
                otherLegBusiness: item.otherLegs || item.level2Business || (index + 1) * 100,
                rewardIncome: item.rewardIncome || (index + 1) * 100
              }));
              
              // Save the migrated structure
              await db.collection('settings').doc('rewardList').set({ 
                ranks: state.rewardList,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
              });
              showMessage('Migrated to simplified reward structure!', 'success');
            } else {
              // Use existing simplified structure - preserve saved values
              state.rewardList = savedRanks.map(item => ({
                rank: item.rank,
                totalBusiness: item.totalBusiness || 0,
                powerLegBusiness: item.powerLegBusiness || 0,
                otherLegBusiness: item.otherLegBusiness || 0,
                rewardIncome: item.rewardIncome || 0
              }));
              
              // Don't auto-calculate total business for saved data
              // Let users manually set their own total business values
            }
          } else {
            // No saved data, create default
            state.rewardList = Array.from({ length: 7 }, (_, i) => ({
              rank: i + 1,
              totalBusiness: (i + 1) * 1000,
              powerLegBusiness: (i + 1) * 100,
              otherLegBusiness: (i + 1) * 100,
              rewardIncome: (i + 1) * 100
            }));
            await db.collection('settings').doc('rewardList').set({ 
              ranks: state.rewardList,
              lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            });
          }
        } else {
          // Document doesn't exist, create default
          state.rewardList = Array.from({ length: 7 }, (_, i) => ({
            rank: i + 1,
            totalBusiness: (i + 1) * 1000,
            powerLegBusiness: (i + 1) * 100,
            otherLegBusiness: (i + 1) * 100,
            rewardIncome: (i + 1) * 100
          }));
          await db.collection('settings').doc('rewardList').set({ 
            ranks: state.rewardList,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
          });
        }
        
        renderRewardRank();
      } catch (e) {
        console.error('Error loading reward settings:', e);
        showMessage('Failed to load reward settings', 'error');
      }
    };

    const renderRewardRank = () => {
      try {
        const tbody = $('#rewardTable tbody');
        if (tbody) {
          tbody.innerHTML = '';
          state.rewardList.forEach(item => {
            tbody.appendChild(createElement('tr', {},
              createElement('td', {}, item.rank),
              createEditableNumberCell(item.totalBusiness, v => {
                item.totalBusiness = Math.max(v, 0);
                // Update the state immediately
                const index = state.rewardList.findIndex(r => r.rank === item.rank);
                if (index !== -1) {
                  state.rewardList[index] = { ...item };
                }
              }, 0),
              createEditableNumberCell(item.powerLegBusiness || 0, v => {
                item.powerLegBusiness = Math.max(v, 0);
                // Update the state immediately
                const index = state.rewardList.findIndex(r => r.rank === item.rank);
                if (index !== -1) {
                  state.rewardList[index] = { ...item };
                }
              }, 0),
              createEditableNumberCell(item.otherLegBusiness || 0, v => {
                item.otherLegBusiness = Math.max(v, 0);
                // Update the state immediately
                const index = state.rewardList.findIndex(r => r.rank === item.rank);
                if (index !== -1) {
                  state.rewardList[index] = { ...item };
                }
              }, 0),
              createEditableNumberCell(item.rewardIncome, v => {
                item.rewardIncome = Math.max(v, 0);
                // Validate that reward income doesn't exceed total business
                if (item.rewardIncome > item.totalBusiness) {
                  showMessage('Reward Income cannot exceed Total Business', 'error');
                  item.rewardIncome = item.totalBusiness;
                }
                // Update the state immediately
                const index = state.rewardList.findIndex(r => r.rank === item.rank);
                if (index !== -1) {
                  state.rewardList[index] = { ...item };
                }
              }, 0),
              createElement('td', {},
                createElement('button', { class: 'small danger', onclick: () => {
                  if (state.rewardList.length > 1 && confirm(`Remove Rank ${item.rank}?`)) {
                    state.rewardList = state.rewardList.filter(l => l.rank !== item.rank);
                    state.rewardList.forEach((l, i) => l.rank = i + 1);
                    renderRewardRank();
                    showMessage(`Rank ${item.rank} removed!`, 'success');
                  }
                } }, 'Delete')
              )
            ));
          });
        }
      } catch (e) {
        console.error('Error rendering rewards:', e);
        showMessage('Failed to render rewards', 'error');
      }
    };

    const saveRewardRank = async () => {
      try {
        // Validate that all required fields are present
        const validatedList = state.rewardList.map(item => ({
          rank: item.rank,
          totalBusiness: item.totalBusiness || 0,
          powerLegBusiness: item.powerLegBusiness || 0,
          otherLegBusiness: item.otherLegBusiness || 0,
          rewardIncome: item.rewardIncome || 0
        }));
        
        // Save to database
        await db.collection('settings').doc('rewardList').set({ 
          ranks: validatedList,
          lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Update local state with validated data
        state.rewardList = validatedList;
        
        // Verify the save by reading back from database
        const verifyDoc = await db.collection('settings').doc('rewardList').get();
        if (verifyDoc.exists) {
          const savedData = verifyDoc.data();
          if (savedData.ranks && savedData.ranks.length === validatedList.length) {
            showMessage('Reward settings saved and verified successfully!', 'success');
          } else {
            showMessage('Warning: Save verification failed', 'warning');
          }
        }
      } catch (e) {
        console.error('Error saving reward settings:', e);
        showMessage('Failed to save reward settings', 'error');
      }
    };

    const assignRewardsToUsers = async () => {
      try {
        const usersSnap = await db.collection('users').get();
        for (const userDoc of usersSnap.docs) {
          const user = userDoc.data();
          if (user.isBlocked) continue;
          
          // Get user's 7-level team data
          const teamData = await getUserTeamData(userDoc.id);
          
          // Calculate business for power leg and other legs
          let powerLegBusiness = 0, otherLegBusiness = 0;
          
          // Find the highest business level (power leg)
          const levelBusinesses = [];
          for (let i = 0; i < 7; i++) {
            if (teamData[i]) {
              const levelBusiness = teamData[i].reduce((sum, member) => sum + (member.selfDeposit || 0), 0);
              levelBusinesses.push(levelBusiness);
            } else {
              levelBusinesses.push(0);
            }
          }
          
          // Power leg is the highest business level
          powerLegBusiness = Math.max(...levelBusinesses);
          
          // Other leg is sum of all other levels
          const totalBusiness = levelBusinesses.reduce((sum, business) => sum + business, 0);
          otherLegBusiness = totalBusiness - powerLegBusiness;
          
          // Find eligible rank based on simplified business structure
          const eligibleRank = state.rewardList.find(rank =>
            user.totalBusiness >= rank.totalBusiness &&
            powerLegBusiness >= rank.powerLegBusiness &&
            otherLegBusiness >= rank.otherLegBusiness
          );

          if (eligibleRank) {
            // Calculate total reward based on 7 levels
            const totalReward = eligibleRank.rewardIncome;
            
            await db.collection('users').doc(userDoc.id).update({
              reward: totalReward,
              rank: eligibleRank.rank,
              powerLegBusiness: powerLegBusiness,
              otherLegBusiness: otherLegBusiness,
              updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Add notification
            await db.collection('notifications').add({
              message: `Congratulations! You achieved Rank ${eligibleRank.rank} with a reward of ${formatCurrency(totalReward)} based on your power leg (${formatCurrency(powerLegBusiness)}) and other legs (${formatCurrency(otherLegBusiness)}) performance.`,
              user: user.email || user.id,
              createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Add income record for the reward
            await db.collection('income').add({
              userId: userDoc.id,
              type: 'reward',
              amount: totalReward,
              status: 'credited',
              createdAt: firebase.firestore.FieldValue.serverTimestamp(),
              description: `Rank ${eligibleRank.rank} Reward - Power Leg: ${formatCurrency(powerLegBusiness)}, Other Legs: ${formatCurrency(otherLegBusiness)}`,
              rank: eligibleRank.rank,
              powerLegBusiness: powerLegBusiness,
              otherLegBusiness: otherLegBusiness
            });
          }
        }
        showMessage('Rewards assigned to eligible users!', 'success');
      } catch (e) {
        console.error('Error assigning rewards:', e);
        showMessage('Failed to assign rewards', 'error');
      }
    };

    // Event listeners will be set up in initializeApp function

    // Add new reward level
    const addRewardLevel = async () => {
      const newRank = state.rewardList.length + 1;
      const newLevel = {
        rank: newRank,
        totalBusiness: newRank * 1000,
        powerLegBusiness: newRank * 100,
        otherLegBusiness: newRank * 100,
        rewardIncome: newRank * 100
      };
      state.rewardList.push(newLevel);
      renderRewardRank();
      
      // Auto-save after adding
      try {
        await db.collection('settings').doc('rewardList').set({ 
          ranks: state.rewardList,
          lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
        showMessage(`Added new reward level ${newRank} and saved!`, 'success');
      } catch (e) {
        console.error('Error auto-saving after adding level:', e);
        showMessage('Added level but failed to auto-save', 'warning');
      }
    };

    // Reset reward levels to default
    const resetRewardLevels = async () => {
      if (confirm('Are you sure you want to reset all reward levels to default? This will remove all custom settings.')) {
        try {
          // Create 7 levels with default simplified structure
          state.rewardList = Array.from({ length: 7 }, (_, i) => ({
            rank: i + 1,
            totalBusiness: (i + 1) * 1000,
            powerLegBusiness: (i + 1) * 100,
            otherLegBusiness: (i + 1) * 100,
            rewardIncome: (i + 1) * 100
          }));
          
          // Save to database
          await db.collection('settings').doc('rewardList').set({ ranks: state.rewardList });
          renderRewardRank();
          showMessage('Reward levels reset to default!', 'success');
        } catch (e) {
          console.error('Error resetting reward levels:', e);
          showMessage('Failed to reset reward levels', 'error');
        }
      }
    };

    // ROI Management
    const loadROISettings = async () => {
      try {
        const roiDoc = await db.collection('adminSettings').doc('roi').get();
        if (roiDoc.exists) {
          const savedSettings = roiDoc.data();
          state.roiSettings = { ...state.roiSettings, ...savedSettings };
          
          // Auto-restore saved settings to form fields if they exist
          if (savedSettings.autoPersist && savedSettings.planType) {
            $('#roiPlanType').value = savedSettings.planType;
            $('#roiPercentage').value = savedSettings.monthlyPercentage || savedSettings.percentage || 1.2;
            $('#roiDuration').value = savedSettings.duration || 30;
            $('#roiStatus').value = savedSettings.status || 'active';
            
            // Show message that settings were auto-restored
            if (savedSettings.lastSavedBy && savedSettings.updatedAt) {
              const lastSaved = savedSettings.updatedAt.toDate ? savedSettings.updatedAt.toDate() : new Date(savedSettings.updatedAt);
              showMessage(`ROI settings auto-restored from ${lastSaved.toLocaleDateString()} by ${savedSettings.lastSavedBy}`, 'success');
            }
          }
        }
        renderROI();
      } catch (error) {
        console.error('Error loading ROI settings:', error);
        showMessage('Error loading ROI settings', 'error');
      }
    };

    const saveROISettings = async () => {
        try {
            const planType = $('#roiPlanType')?.value;
            const percentage = parseFloat($('#roiPercentage')?.value);
            const duration = parseInt($('#roiDuration')?.value);
            const status = $('#roiStatus')?.value;

            if (!planType || isNaN(percentage) || isNaN(duration)) {
                showMessage('Please fill all fields with valid values', 'error');
                return;
            }

            // Calculate daily ROI based on plan type
            let dailyROI, maxROI, maxDays;
            
            if (planType === 'daily') {
                dailyROI = percentage / 100;
                maxROI = (percentage / 100) * duration;
                maxDays = duration;
            } else if (planType === 'weekly') {
                dailyROI = (percentage / 100) / 7; // Weekly percentage divided by 7 days
                maxROI = percentage / 100;
                maxDays = duration * 7;
            } else if (planType === 'monthly') {
                dailyROI = (percentage / 100) / 30; // Monthly percentage divided by 30 days
                maxROI = percentage / 100;
                maxDays = duration * 30;
            } else {
                showMessage('Invalid plan type selected', 'error');
                return;
            }

            const roiSettings = {
                planType,
                monthlyPercentage: percentage, // Store the original monthly percentage
                dailyROI: dailyROI, // Calculated daily ROI
                maxROI: maxROI, // Maximum ROI percentage
                duration: duration, // Duration in plan units (days/weeks/months)
                maxDays: maxDays, // Maximum days for ROI calculation
                status,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                autoScheduler: true, // Enable automatic scheduler
                lastScheduledAt: firebase.firestore.FieldValue.serverTimestamp(),
                autoPersist: true, // Enable automatic persistence
                lastSavedBy: state.currentUser?.email || 'admin',
                settingsVersion: Date.now() // Track settings version for changes
            };

            await db.collection('adminSettings').doc('roi').set(roiSettings);
            state.roiSettings = roiSettings;
            
            // Start enhanced automatic ROI scheduler if status is active
            if (status === 'active') {
                startAutomaticROIScheduler();
                showMessage(`🚀 Enhanced ROI settings saved and will persist automatically! Daily ROI: ${(dailyROI * 100).toFixed(4)}%, Max Days: ${maxDays}. Enhanced scheduler started with cross-session persistence!`, 'success');
            } else {
                showMessage(`💾 Enhanced ROI settings saved and will persist automatically! Daily ROI: ${(dailyROI * 100).toFixed(4)}%, Max Days: ${maxDays}. ROI is currently inactive but settings are saved.`, 'success');
            }
            
            // Reload ROI settings
            await loadROISettings();
        } catch (error) {
            console.error('Error saving ROI settings:', error);
            showMessage('Failed to save ROI settings', 'error');
        }
    };

    const recalculateAllUserROI = async () => {
      try {
        // Get current ROI settings
        const roiDoc = await db.collection('adminSettings').doc('roi').get();
        if (!roiDoc.exists) {
          showMessage('ROI settings not found. Please save ROI settings first.', 'error');
          return;
        }
        
        const roiSettings = roiDoc.data();
        const { dailyROI, maxDays, status } = roiSettings;
        
        if (status !== 'active') {
          showMessage('ROI is currently inactive. Please activate ROI first.', 'error');
          return;
        }
        
        const usersSnapshot = await db.collection('users').get();
        let processed = 0;
        let totalROICalculated = 0;
        
        showMessage('Starting ROI recalculation...', 'success');
        
        for (const doc of usersSnapshot.docs) {
          const user = doc.data();
          if (user.isActive) {
            // Calculate ROI for this user
            const depositsSnapshot = await db.collection('deposits')
              .where('userId', '==', doc.id)
              .where('status', '==', 'approved')
              .get();
            
            let totalROIEarned = 0;
            depositsSnapshot.forEach(depositDoc => {
              const deposit = depositDoc.data();
              const depositAmount = deposit.amount || 0;
              const depositDate = deposit.approvedAt?.toDate() || new Date();
              const daysSinceDeposit = Math.floor((Date.now() - depositDate.getTime()) / (1000 * 60 * 60 * 24));
              
              // Use maxDays from settings instead of calculating
              const roiDays = Math.min(daysSinceDeposit, maxDays);
              const roiEarned = depositAmount * dailyROI * roiDays;
              
              totalROIEarned += roiEarned;
            });
            
            await db.collection('users').doc(doc.id).update({
              roiIncome: totalROIEarned,
              lastROICalculation: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            totalROICalculated += totalROIEarned;
            processed++;
          }
        }
        
        showMessage(`ROI recalculated for ${processed} active users. Total ROI: $${totalROICalculated.toFixed(2)}`, 'success');
      } catch (error) {
        console.error('Error recalculating ROI:', error);
        showMessage('Error recalculating ROI for users', 'error');
      }
    };

    const renderROIHistory = async () => {
      try {
        const tbody = $('#roiHistoryBody');
        if (tbody) {
          tbody.innerHTML = '';
          const snapshot = await db.collection('roiHistory').orderBy('date', 'desc').limit(10).get();
          const historyItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

          historyItems.forEach(item => {
            if (!item.isBlocked) {
              tbody.appendChild(createElement('tr', {},
                createElement('td', {}, formatDate(item.date)),
                createElement('td', {}, item.user || '-'),
                createElement('td', {}, formatCurrency(item.amount)),
                createElement('td', {}, item.status || 'Pending'),
                createElement('td', {},
                  createElement('button', { class: 'small primary', onclick: () => alert(`View details for ${item.user}`) }, 'View')
                )
              ));
            }
          });
        }
      } catch (e) {
        console.error('Error rendering ROI history:', e);
        showMessage('Failed to render ROI history', 'error');
      }
    };

    $('#roiSettingsForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      await saveROISettings();
    });

    // Deposit Management
    const loadDepositMethods = async () => {
      try {
        const methodsDoc = await db.collection('adminSettings').doc('paymentMethods').get();
        if (methodsDoc.exists) {
          state.depositMethods = methodsDoc.data();
        }
        renderDeposit();
      } catch (error) {
        console.error('Error loading deposit methods:', error);
        showMessage('Error loading deposit methods', 'error');
      }
    };

    const saveDepositMethods = async () => {
      try {
        const methods = {
          usdtBep20: $('#usdtBep20').value.trim(),
          usdtTrc20: $('#usdtTrc20').value.trim(),
          upiId: $('#upiId').value.trim(),
          bankDetails: $('#bankDetails').value.trim(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('adminSettings').doc('paymentMethods').set(methods);
        state.depositMethods = methods;
        showMessage('Payment methods saved successfully', 'success');
      } catch (error) {
        console.error('Error saving deposit methods:', error);
        showMessage('Error saving payment methods', 'error');
      }
    };

    $('#depositMethodsForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const methods = {
        usdtBep20: DOMPurify ? DOMPurify.sanitize($('#usdtBep20')?.value) || '' : $('#usdtBep20')?.value || '',
        usdtTrc20: DOMPurify ? DOMPurify.sanitize($('#usdtTrc20')?.value) || '' : $('#usdtTrc20')?.value || '',
        upiId: DOMPurify ? DOMPurify.sanitize($('#upiId')?.value) || '' : $('#upiId')?.value || '',
        bankDetails: DOMPurify ? DOMPurify.sanitize($('#bankDetails')?.value) || '' : $('#bankDetails')?.value || '',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      try {
        // Save to BOTH locations for compatibility
        await db.collection('adminSettings').doc('paymentMethods').set(methods);
        await db.collection('settings').doc('depositMethods').set(methods);
        state.depositMethods = methods;
        showMessage('Deposit methods saved!', 'success');
        renderUserDeposit();
        db.collection('notifications').add({
          message: 'Deposit methods have been updated by admin.',
          user: 'all',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      } catch (e) {
        showMessage(`Error saving deposit methods: ${e.message}`, 'error');
      }
    });

    const loadDeposits = async () => {
      try {
        console.log('Fetching deposits...');
        db.collection('deposits').orderBy('createdAt', 'desc').limit(50).onSnapshot(async (snapshot) => {
          const deposits = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          
          // Fetch user details for each deposit
          const depositsWithUserInfo = await Promise.all(
            deposits.map(async (deposit) => {
              try {
                const userDoc = await db.collection('users').doc(deposit.userId).get();
                if (userDoc.exists) {
                  const userData = userDoc.data();
                  return {
                    ...deposit,
                    userName: userData.name || 'Unknown',
                    userEmail: userData.email || ''
                  };
                } else {
                  return {
                    ...deposit,
                    userName: 'Unknown',
                    userEmail: ''
                  };
                }
              } catch (error) {
                console.error('Error fetching user data for deposit:', deposit.id, error);
                return {
                  ...deposit,
                  userName: 'Unknown',
                  userEmail: ''
                };
              }
            })
          );
          
          state.deposits = depositsWithUserInfo;
          console.log('Deposits loaded with user info:', state.deposits.length);
          renderDeposit();
        }, (error) => {
          console.error('Error fetching deposits:', error);
          showMessage('Failed to load deposit requests: ' + error.message, 'error');
        });
      } catch (e) {
        console.error('Error setting up deposits listener:', e);
        showMessage('Failed to load deposit requests', 'error');
      }
    };

    const renderDeposit = async () => {
      // Set values for static HTML form fields
      if ($('#usdtBep20')) $('#usdtBep20').value = state.depositMethods.usdtBep20 || '';
      if ($('#usdtTrc20')) $('#usdtTrc20').value = state.depositMethods.usdtTrc20 || '';
      if ($('#upiId')) $('#upiId').value = state.depositMethods.upiId || '';
      if ($('#bankDetails')) $('#bankDetails').value = state.depositMethods.bankDetails || '';

      // Bind submit event (remove previous to avoid duplicate)
      const form = $('#depositMethodsForm');
      if (form) {
        form.onsubmit = async (e) => {
          e.preventDefault();
          const methods = {
            usdtBep20: DOMPurify ? DOMPurify.sanitize($('#usdtBep20').value) : $('#usdtBep20').value,
            usdtTrc20: DOMPurify ? DOMPurify.sanitize($('#usdtTrc20').value) : $('#usdtTrc20').value,
            upiId: DOMPurify ? DOMPurify.sanitize($('#upiId').value) : $('#upiId').value,
            bankDetails: DOMPurify ? DOMPurify.sanitize($('#bankDetails').value) : $('#bankDetails').value,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          };
          try {
            await db.collection('adminSettings').doc('paymentMethods').set(methods);
            await db.collection('settings').doc('depositMethods').set(methods);
            state.depositMethods = methods;
            showMessage('Deposit methods saved!', 'success');
          } catch (e) {
            showMessage(`Error saving deposit methods: ${e.message}`, 'error');
          }
        };
      }

      // Render deposits table
      const tbody = $('#depositRequestsBody');
      if (!tbody) {
        console.error('Deposit requests table body not found');
        return;
      }

      const searchTerm = $('#depositSearchInput')?.value?.toLowerCase() || '';
      const filteredDeposits = state.deposits.filter(deposit => {
        const userMatch = deposit.userName?.toLowerCase().includes(searchTerm) || 
                         deposit.userEmail?.toLowerCase().includes(searchTerm) ||
                         deposit.userId?.toLowerCase().includes(searchTerm);
        const statusMatch = deposit.status?.toLowerCase().includes(searchTerm);
        return userMatch || statusMatch;
      });

      if (filteredDeposits.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px; color: #9ebbf0aa;">No deposits found</td></tr>';
        return;
      }

      tbody.innerHTML = filteredDeposits.map(deposit => {
        const userName = DOMPurify ? DOMPurify.sanitize(deposit.userName || 'Unknown') : (deposit.userName || 'Unknown');
        const userEmail = DOMPurify ? DOMPurify.sanitize(deposit.userEmail || '') : (deposit.userEmail || '');
        const method = DOMPurify ? DOMPurify.sanitize(deposit.method || '') : (deposit.method || '');
        const amount = formatCurrency(deposit.amount || 0);
        const utr = DOMPurify ? DOMPurify.sanitize(deposit.utr || '') : (deposit.utr || '');
        const status = deposit.status || 'pending';
        const date = deposit.createdAt ? formatDate(deposit.createdAt.toDate()) : 'N/A';
        const screenshotUrl = deposit.screenshotUrl || '';

        const statusClass = status === 'approved' ? 'success' : status === 'rejected' ? 'danger' : 'warning';
        const statusText = status.charAt(0).toUpperCase() + status.slice(1);

        return `
          <tr>
            <td>${userName}</td>
            <td>${userEmail}</td>
            <td>${amount}</td>
            <td>${date}</td>
            <td>${method}</td>
            <td><span class="${statusClass}">${statusText}</span></td>
            <td>
              ${screenshotUrl ? 
                `<button class="view-screenshot small" data-url="${screenshotUrl}" style="background: #4a59a9; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">View</button>` : 
                'No Screenshot'
              }
            </td>
            <td>
              ${status === 'pending' ? `
                <button class="approve-deposit small success" data-id="${deposit.id}" data-user="${userName}" data-amount="${deposit.amount}">Approve</button>
                <button class="reject-deposit small danger" data-id="${deposit.id}" data-user="${userName}">Reject</button>
              ` : `
                <span style="color: #9ebbf0aa;">${status === 'approved' ? 'Approved' : 'Rejected'}</span>
              `}
            </td>
          </tr>
        `;
      }).join('');
    };

    const setupScreenshotModal = () => {
      const modal = $('#screenshotModal');
      const screenshotImage = $('#screenshotImage');
      const closeBtn = modal?.querySelector('.close');

      document.addEventListener('click', (e) => {
        if (e.target.classList.contains('view-screenshot')) {
          const url = e.target.getAttribute('data-url');
          if (screenshotImage && modal) {
            screenshotImage.src = DOMPurify ? DOMPurify.sanitize(url) : url;
            modal.style.display = 'flex';
          }
        }
      });

      closeBtn?.addEventListener('click', () => {
        if (modal && screenshotImage) {
          modal.style.display = 'none';
          screenshotImage.src = '';
        }
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal?.style.display === 'flex') {
          modal.style.display = 'none';
          screenshotImage.src = '';
        }
      });
    };

    const setupDepositActions = () => {
      document.addEventListener('click', (e) => {
        if (e.target.classList.contains('approve-deposit')) {
          const id = e.target.getAttribute('data-id');
          const user = e.target.getAttribute('data-user');
          const amount = parseFloat(e.target.getAttribute('data-amount'));
          approveDeposit(id, user, amount);
        } else if (e.target.classList.contains('reject-deposit')) {
          const id = e.target.getAttribute('data-id');
          const user = e.target.getAttribute('data-user');
          rejectDeposit(id, user);
        }
      });
    };

    const approveDeposit = async (id, user, amount) => {
      try {
        if (!confirm(`Approve ${formatCurrency(amount)} deposit for ${user}?`)) return;
        
        const db = firebase.firestore();
        const depositRef = db.collection('deposits').doc(id);
        
        // Get the deposit to find the userId
        const depositDoc = await depositRef.get();
        if (!depositDoc.exists) {
          throw new Error('Deposit not found');
        }
        
        const depositData = depositDoc.data();
        const userId = depositData.userId;
        
        if (!userId) {
          throw new Error('Deposit does not have a valid user ID');
        }

        // Check if user exists and is not blocked
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
          throw new Error('User not found');
        }
        
        if (userDoc.data().isBlocked) {
          showMessage('Cannot approve deposit for blocked user', 'error');
          return;
        }

        await db.runTransaction(async (transaction) => {
          const depositDoc = await transaction.get(depositRef);
          if (!depositDoc.exists) throw new Error('Deposit not found');
          if (depositDoc.data().status !== 'pending') {
            throw new Error('Deposit is not pending');
          }

          const userRef = db.collection('users').doc(userId);
          const userDoc = await transaction.get(userRef);
          if (!userDoc.exists) throw new Error('User not found');

          transaction.update(depositRef, {
            status: 'approved',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });

          const currentBalance = userDoc.data().balance || 0;
          const newBalance = currentBalance + amount;
          
          // Check if user should be activated (minimum $20 in wallet)
          const isUserActive = newBalance >= 20;
          
          transaction.update(userRef, {
            balance: newBalance,
            isActive: isUserActive,
            status: isUserActive ? 'active' : 'inactive',
            totalDeposits: firebase.firestore.FieldValue.increment(amount),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });

          console.log(`Approving deposit ${id} for user ${userId}: Adding ${amount} to balance ${currentBalance}, new balance: ${newBalance}, active: ${isUserActive}`);
        });

        // Get user email for notification
        const userData = userDoc.data();
        const userEmail = userData.email || '';
        const newBalance = userData.balance + amount;
        const isUserActive = newBalance >= 20;
        
        let notificationMessage = `Your deposit of ${formatCurrency(amount)} has been approved. Your new balance is ${formatCurrency(newBalance)}.`;
        
        if (isUserActive && !userData.isActive) {
          notificationMessage += ` Congratulations! Your account is now active and you can earn ROI income.`;
        } else if (!isUserActive) {
          notificationMessage += ` Add $${(20 - newBalance).toFixed(2)} more to activate your account and start earning ROI income.`;
        }

        await db.collection('notifications').add({
          message: notificationMessage,
          user: userEmail,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        showMessage(`Deposit for ${user} approved!`, 'success');
        loadDeposits();
        loadDashboardStats();
      } catch (e) {
        console.error('Error approving deposit:', e);
        showMessage(`Failed to approve deposit: ${e.message}`, 'error');
      }
    };

    const rejectDeposit = async (id, user) => {
      try {
        if (!confirm(`Reject deposit for ${user}?`)) return;
        
        // Get the deposit to find the userId
        const depositDoc = await db.collection('deposits').doc(id).get();
        if (!depositDoc.exists) {
          throw new Error('Deposit not found');
        }
        
        const depositData = depositDoc.data();
        const userId = depositData.userId;
        
        await db.collection('deposits').doc(id).update({
          status: 'rejected',
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Get user email for notification
        const userDoc = await db.collection('users').doc(userId).get();
        const userEmail = userDoc.exists ? userDoc.data().email : '';
        
        await db.collection('notifications').add({
          message: `Your deposit request has been rejected.`,
          user: userEmail,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showMessage(`Deposit for ${user} rejected!`, 'success');
        loadDeposits();
        loadDashboardStats();
      } catch (e) {
        console.error('Error rejecting deposit:', e);
        showMessage('Failed to reject deposit', 'error');
      }
    };

    $('#depositSearchInput')?.addEventListener('input', renderDeposit);
    $('#refreshDeposits')?.addEventListener('click', () => {
      loadDeposits();
      showMessage('Deposit requests refreshed', 'success');
    });

    // User Deposit
    const renderUserDeposit = async () => {
      try {
        const container = $('#userDepositContainer');
        if (container) {
          container.innerHTML = '';
          await loadDepositMethods();
          const methods = state.depositMethods;
          const methodOptions = [
            methods.usdtBep20 && { value: 'USDT BEP20', details: methods.usdtBep20 },
            methods.usdtTrc20 && { value: 'USDT TRC20', details: methods.usdtTrc20 },
            methods.upiId && { value: 'UPI', details: methods.upiId },
            methods.bankDetails && { value: 'Bank', details: methods.bankDetails }
          ].filter(Boolean);

          if (!methodOptions.length) {
            container.appendChild(createElement('p', {}, 'No deposit methods available.'));
            return;
          }

          const form = createElement('form', { id: 'userDepositForm' },
            createElement('h3', {}, 'Make a Deposit'),
            createElement('label', { for: 'depositMethod' }, 'Select Method:'),
            createElement('select', { id: 'depositMethod' },
              ...methodOptions.map(m => createElement('option', { value: m.value }, m.value))
            ),
            createElement('div', { id: 'methodDetails', style: 'margin: 10px 0;' }),
            createElement('label', { for: 'depositAmount' }, 'Amount ($):'),
            createElement('input', { type: 'number', id: 'depositAmount', min: '1', step: '0.01', required: true }),
            createElement('button', { type: 'submit', class: 'primary' }, 'Submit Deposit')
          );

          container.appendChild(form);

          const methodSelect = $('#depositMethod');
          const detailsDiv = $('#methodDetails');
          const updateDetails = () => {
            const selected = methodOptions.find(m => m.value === methodSelect.value);
            detailsDiv.innerHTML = selected ? `<strong>Details:</strong> ${DOMPurify ? DOMPurify.sanitize(selected.details) : selected.details}` : '';
          };
          methodSelect.addEventListener('change', updateDetails);
          updateDetails();

          form.addEventListener('submit', e => {
            e.preventDefault();
            submitDepositRequest();
          });
        }
      } catch (e) {
        console.error('Error rendering user deposit:', e);
        showMessage('Failed to load deposit page', 'error');
      }
    };

    const submitDepositRequest = async () => {
      try {
        const method = $('#depositMethod')?.value;
        const amount = parseFloat($('#depositAmount')?.value);
        if (!method || !amount || amount <= 0) {
          showMessage('Please select a method and enter a valid amount', 'error');
          return;
        }
        if (!state.currentUser) {
          showMessage('Please log in to submit a deposit', 'error');
          return;
        }
        const userDoc = await db.collection('users').doc(state.currentUser.uid).get();
        if (userDoc.exists && userDoc.data().isBlocked) {
          showMessage('Cannot submit deposit: Your account is blocked', 'error');
          return;
        }
        const deposit = {
          userId: state.currentUser.uid,
          user: state.currentUser.email,
          amount,
          method,
          status: 'pending',
          date: new Date().toISOString().slice(0, 10),
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        await db.collection('deposits').add(deposit);
        showMessage('Deposit request submitted!', 'success');
        $('#depositAmount').value = '';
        await db.collection('notifications').add({
          message: `New deposit request of ${formatCurrency(amount)} submitted.`,
          user: 'support@theonewealthwave.com',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        loadDeposits();
        loadDashboardStats();
      } catch (e) {
        console.error('Error submitting deposit:', e);
        showMessage('Failed to submit deposit request', 'error');
      }
    };

    // Withdrawals
    const loadWithdrawals = async () => {
      try {
        const snapshot = await db.collection('withdrawals').orderBy('createdAt', 'desc').limit(50).get();
        const withdrawals = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Fetch user details for each withdrawal
        const withdrawalsWithUserDetails = await Promise.all(
          withdrawals.map(async (withdrawal) => {
            try {
              // Try to find user by email first, then by userId
              let userDoc;
              if (withdrawal.userEmail) {
                userDoc = await db.collection('users').where('email', '==', withdrawal.userEmail).get();
              } else if (withdrawal.userId) {
                userDoc = await db.collection('users').doc(withdrawal.userId).get();
              }
              
              if (userDoc && !userDoc.empty) {
                const userData = userDoc.docs ? userDoc.docs[0].data() : userDoc.data();
                return {
                  ...withdrawal,
                  userName: userData.name || 'Unknown',
                  userNumber: userData.mobile || 'N/A',
                  userEmail: userData.email || withdrawal.userEmail || withdrawal.user
                };
              } else {
                return {
                  ...withdrawal,
                  userName: 'Unknown',
                  userNumber: 'N/A',
                  userEmail: withdrawal.userEmail || withdrawal.user
                };
              }
            } catch (error) {
              console.error('Error fetching user details for withdrawal:', error);
              return {
                ...withdrawal,
                userName: 'Unknown',
                userNumber: 'N/A',
                userEmail: withdrawal.userEmail || withdrawal.user
              };
            }
          })
        );
        
        state.withdrawals = withdrawalsWithUserDetails;
        renderWithdrawal();
      } catch (e) {
        console.error('Error loading withdrawals:', e);
        showMessage('Failed to load withdrawal requests', 'error');
      }
    };

    const renderWithdrawal = () => {
      try {
        const tbody = $('#withdrawalRequestsBody');
        const filter = $('#withdrawalSearchInput')?.value?.toLowerCase() || '';
        if (tbody) {
          tbody.innerHTML = '';
          state.withdrawals
            .filter(w => {
              const userMatch = w.user?.toLowerCase?.()?.includes(filter);
              const userNameMatch = w.userName?.toLowerCase?.()?.includes(filter);
              const userNumberMatch = w.userNumber?.toLowerCase?.()?.includes(filter);
              const userEmailMatch = w.userEmail?.toLowerCase?.()?.includes(filter);
              const statusMatch = w.status?.toLowerCase?.()?.includes(filter);
              const typeMatch = w.type?.toLowerCase?.()?.includes(filter);
              const isBlocked = state.userList.find(u => u.email === w.userEmail || u.id === w.userId)?.isBlocked;
              return (userMatch || userNameMatch || userNumberMatch || userEmailMatch || statusMatch || typeMatch) && !isBlocked;
            })
            .forEach(w => {
              const approveBtn = w.status === 'pending' ? createElement('button', {
                class: 'small primary',
                onclick: () => approveWithdrawal(w.id, w.userEmail || w.user, w.amount)
              }, 'Approve') : null;
              const rejectBtn = w.status === 'pending' ? createElement('button', {
                class: 'small danger',
                onclick: () => rejectWithdrawal(w.id, w.userEmail || w.user)
              }, 'Reject') : null;
              
              // Format withdrawal type for display with styling
              const withdrawalType = w.type === 'principal' ? 'Principal' : 
                                   w.type === 'income' ? 'Income' : 
                                   w.type || 'Unknown';
              
              // Create styled type badge
              const typeBadge = createElement('span', {
                class: `badge ${w.type === 'principal' ? 'primary' : w.type === 'income' ? 'success' : 'secondary'}`
              }, withdrawalType);
              
              // Get processing fee and net amount
              const processingFee = w.processingFee || 0;
              const netAmount = w.netAmount || w.amount || 0;
              
              // Create user info cell with name and number
              const userInfoCell = createElement('td', { style: 'min-width: 200px;' },
                createElement('div', { style: 'display: flex; flex-direction: column; gap: 2px;' },
                  createElement('span', { style: 'font-weight: 600; color: var(--accent);' }, w.userName || 'Unknown'),
                  createElement('span', { style: 'font-size: 12px; color: var(--text-secondary);' }, w.userNumber || 'N/A'),
                  createElement('span', { style: 'font-size: 11px; color: var(--text-secondary); opacity: 0.8;' }, w.userEmail || w.user || '-')
                )
              );
              
              tbody.appendChild(createElement('tr', {},
                userInfoCell,
                createElement('td', {}, typeBadge),
                createElement('td', {}, formatCurrency(w.amount)),
                createElement('td', {}, formatCurrency(processingFee)),
                createElement('td', {}, formatCurrency(netAmount)),
                createElement('td', {}, formatDate(w.createdAt?.toDate())),
                createElement('td', {}, w.method || '-'),
                createElement('td', {}, w.status || 'pending'),
                createElement('td', {}, [approveBtn, rejectBtn].filter(Boolean))
              ));
            });
        }
      } catch (e) {
        console.error('Error rendering withdrawals:', e);
        showMessage('Failed to render withdrawals', 'error');
      }
    };

    const approveWithdrawal = async (id, user, amount) => {
      try {
        // Find the withdrawal document to get type and net amount
        const withdrawalDoc = await db.collection('withdrawals').doc(id).get();
        if (!withdrawalDoc.exists) {
          showMessage('Withdrawal request not found', 'error');
          return;
        }
        
        const withdrawalData = withdrawalDoc.data();
        const withdrawalType = withdrawalData.type === 'principal' ? 'Principal' : 
                             withdrawalData.type === 'income' ? 'Income' : 
                             withdrawalData.type || 'Unknown';
        const netAmount = withdrawalData.netAmount || amount;
        const processingFee = withdrawalData.processingFee || 0;
        
        const confirmMessage = `Approve ${withdrawalType} withdrawal for ${user}?\n\n` +
                             `Requested Amount: ${formatCurrency(amount)}\n` +
                             `Processing Fee: ${formatCurrency(processingFee)}\n` +
                             `Net Amount to Pay: ${formatCurrency(netAmount)}`;
        
        if (!confirm(confirmMessage)) return;
        
        const userDoc = await db.collection('users').where('email', '==', user).get();
        if (userDoc.empty) throw new Error('User not found');
        const userData = userDoc.docs[0].data();
        if (userData.isBlocked) {
          showMessage('Cannot approve withdrawal for blocked user', 'error');
          return;
        }
        await db.collection('withdrawals').doc(id).update({
          status: 'approved',
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        await db.collection('notifications').add({
          message: `Your ${withdrawalType.toLowerCase()} withdrawal of ${formatCurrency(amount)} has been approved. Net amount: ${formatCurrency(netAmount)}`,
          user,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showMessage(`${withdrawalType} withdrawal for ${user} approved! Net amount: ${formatCurrency(netAmount)}`, 'success');
        loadWithdrawals();
        loadDashboardStats();
      } catch (e) {
        console.error('Error approving withdrawal:', e);
        showMessage(`Failed to approve withdrawal: ${e.message}`, 'error');
      }
    };

    const rejectWithdrawal = async (id, user) => {
      try {
        // Find the withdrawal document to get type
        const withdrawalDoc = await db.collection('withdrawals').doc(id).get();
        if (!withdrawalDoc.exists) {
          showMessage('Withdrawal request not found', 'error');
          return;
        }
        
        const withdrawalData = withdrawalDoc.data();
        const withdrawalType = withdrawalData.type === 'principal' ? 'Principal' : 
                             withdrawalData.type === 'income' ? 'Income' : 
                             withdrawalData.type || 'Unknown';
        
        if (!confirm(`Reject ${withdrawalType} withdrawal for ${user}?`)) return;
        
        await db.collection('withdrawals').doc(id).update({
          status: 'rejected',
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        await db.collection('notifications').add({
          message: `Your ${withdrawalType.toLowerCase()} withdrawal request has been rejected.`,
          user,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showMessage(`${withdrawalType} withdrawal for ${user} rejected!`, 'success');
        loadWithdrawals();
        loadDashboardStats();
      } catch (e) {
        console.error('Error rejecting withdrawal:', e);
        showMessage('Failed to reject withdrawal', 'error');
      }
    };

    $('#withdrawalSearchInput')?.addEventListener('input', renderWithdrawal);
    $('#refreshWithdrawals')?.addEventListener('click', () => {
      loadWithdrawals();
      showMessage('Withdrawal requests refreshed', 'success');
    });

    // Level Income Approval
    const approveLevelIncome = async (incomeId, userId, amount) => {
      try {
        if (!confirm(`Approve level income of ${formatCurrency(amount)} for user ${userId}?`)) return;

        const db = firebase.firestore();
        const incomeRef = db.collection('income').doc(incomeId);
        const userRef = db.collection('users').doc(userId);

        await db.runTransaction(async (transaction) => {
          const incomeDoc = await transaction.get(incomeRef);
          if (!incomeDoc.exists) throw new Error('Income record not found');
          if (incomeDoc.data().status === 'approved') throw new Error('Income already approved');

          const userDoc = await transaction.get(userRef);
          if (!userDoc.exists) throw new Error('User not found');
          if (userDoc.data().isBlocked) throw new Error('Cannot approve income for blocked user');

          transaction.update(incomeRef, {
            status: 'approved',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });

          const currentBalance = userDoc.data().balance || 0;
          transaction.update(userRef, {
            balance: currentBalance + amount,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });

          console.log(`Approved level income ${incomeId} for user ${userId}: Added ${amount} to balance ${currentBalance}`);
        });

        await db.collection('notifications').add({
          message: `Your level income of ${formatCurrency(amount)} has been approved.`,
          user: userId,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        showMessage(`Level income for ${userId} approved!`, 'success');
        loadReports();
      } catch (e) {
        console.error('Error approving level income:', e);
        showMessage(`Failed to approve level income: ${e.message}`, 'error');
      }
    };

    // Reports
    const loadReports = async () => {
      try {
        const selfIncomeSnap = await db.collection('income').where('type', '==', 'self').orderBy('date', 'desc').limit(50).get();
        const levelIncomeSnap = await db.collection('income').where('type', '==', 'level').orderBy('date', 'desc').limit(50).get();
        const rewardSnap = await db.collection('rewards').orderBy('date', 'desc').limit(50).get();
        const roiSnap = await db.collection('roiHistory').orderBy('date', 'desc').limit(50).get();

        state.reports.selfIncome = selfIncomeSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        state.reports.levelIncome = levelIncomeSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        state.reports.reward = rewardSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        state.reports.roi = roiSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                renderReports();
      } catch (e) {
        console.error('Error loading reports:', e);
        showMessage('Failed to load reports', 'error');
      }
    };

    const renderReports = () => {
      try {
        const selfIncomeTableBody = $('#selfIncomeTableBody');
        const levelIncomeTableBody = $('#levelIncomeReportTableBody');
        const rewardTableBody = $('#rewardTableBody');
        const roiTableBody = $('#roiTableBody');
        const filter = $('#reportSearchInput')?.value?.toLowerCase() || '';

        // Self Income Report
        if (selfIncomeTableBody) {
          selfIncomeTableBody.innerHTML = '';
          state.reports.selfIncome
            .filter(item => 
              !state.userList.find(u => u.id === item.userId)?.isBlocked &&
              (item.user?.toLowerCase?.()?.includes(filter) || 
               item.status?.toLowerCase?.()?.includes(filter))
            )
            .forEach(item => {
              selfIncomeTableBody.appendChild(createElement('tr', {},
                createElement('td', {}, item.user || '-'),
                createElement('td', {}, formatCurrency(item.amount)),
                createElement('td', {}, formatDate(item.date)),
                createElement('td', {}, item.status || 'Pending'),
                createElement('td', {}, 
                  createElement('button', { class: 'small primary', onclick: () => viewReportDetails(item) }, 'View')
                )
              ));
            });
        }

        // Level Income Report
        if (levelIncomeTableBody) {
          levelIncomeTableBody.innerHTML = '';
          state.reports.levelIncome
            .filter(item => 
              !state.userList.find(u => u.id === item.userId)?.isBlocked &&
              (item.user?.toLowerCase?.()?.includes(filter) || 
               item.status?.toLowerCase?.()?.includes(filter))
            )
            .forEach(item => {
              const approveBtn = item.status === 'pending' ? createElement('button', {
                class: 'small success approve-level-income',
                'data-id': item.id,
                'data-user': item.user,
                'data-amount': item.amount,
                onclick: () => approveLevelIncome(item.id, item.userId, item.amount)
              }, 'Approve') : null;
              
              levelIncomeTableBody.appendChild(createElement('tr', {},
                createElement('td', {}, item.user || '-'),
                createElement('td', {}, item.level || '-'),
                createElement('td', {}, formatCurrency(item.amount)),
                createElement('td', {}, formatDate(item.date)),
                createElement('td', {}, item.status || 'Pending'),
                createElement('td', {}, [approveBtn, createElement('button', { class: 'small primary', onclick: () => viewReportDetails(item) }, 'View')].filter(Boolean))
              ));
            });
        }

        // Reward Report
        if (rewardTableBody) {
          rewardTableBody.innerHTML = '';
          state.reports.reward
            .filter(item => 
              !state.userList.find(u => u.id === item.userId)?.isBlocked &&
              (item.user?.toLowerCase?.()?.includes(filter) || 
               item.status?.toLowerCase?.()?.includes(filter))
            )
            .forEach(item => {
              rewardTableBody.appendChild(createElement('tr', {},
                createElement('td', {}, item.user || '-'),
                createElement('td', {}, item.rank || '-'),
                createElement('td', {}, formatCurrency(item.amount)),
                createElement('td', {}, formatDate(item.date)),
                createElement('td', {}, item.status || 'Pending'),
                createElement('td', {}, 
                  createElement('button', { class: 'small primary', onclick: () => viewReportDetails(item) }, 'View')
                )
              ));
            });
        }

        // ROI Report
        if (roiTableBody) {
          roiTableBody.innerHTML = '';
          state.reports.roi
            .filter(item => 
              !state.userList.find(u => u.id === item.userId)?.isBlocked &&
              (item.user?.toLowerCase?.()?.includes(filter) || 
               item.status?.toLowerCase?.()?.includes(filter))
            )
            .forEach(item => {
              roiTableBody.appendChild(createElement('tr', {},
                createElement('td', {}, item.user || '-'),
                createElement('td', {}, formatCurrency(item.amount)),
                createElement('td', {}, formatDate(item.date)),
                createElement('td', {}, item.status || 'Pending'),
                createElement('td', {}, 
                  createElement('button', { class: 'small primary', onclick: () => viewReportDetails(item) }, 'View')
                )
              ));
            });
        }
      } catch (e) {
        console.error('Error rendering reports:', e);
        showMessage('Failed to render reports', 'error');
      }
    };

    const viewReportDetails = (item) => {
      const modal = createElement('div', { class: 'modal', style: 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center;' },
        createElement('div', { class: 'modal-content', style: 'background: #2a2f4a; padding: 20px; border-radius: 10px; max-width: 400px;' },
          createElement('h3', {}, 'Report Details'),
          createElement('p', {}, `User: ${DOMPurify ? DOMPurify.sanitize(item.user) : item.user || '-'}`),
          createElement('p', {}, `Type: ${item.type || 'N/A'}`),
          createElement('p', {}, `Amount: ${formatCurrency(item.amount)}`),
          createElement('p', {}, `Date: ${formatDate(item.date)}`),
          createElement('p', {}, `Status: ${item.status || 'Pending'}`),
          item.level ? createElement('p', {}, `Level: ${item.level}`) : null,
          item.rank ? createElement('p', {}, `Rank: ${item.rank}`) : null,
          createElement('button', { class: 'secondary', onclick: () => modal.remove() }, 'Close')
        )
      );
      document.body.appendChild(modal);
    };

    const exportReport = (type) => {
      try {
        const data = state.reports[type] || [];
        const csv = [
          ['User', 'Type', 'Amount', 'Date', 'Status', type === 'levelIncome' ? 'Level' : type === 'reward' ? 'Rank' : ''],
          ...data
            .filter(item => !state.userList.find(u => u.id === item.userId)?.isBlocked)
            .map(item => [
              DOMPurify ? DOMPurify.sanitize(item.user) : item.user || '-',
              item.type || '-',
              formatCurrency(item.amount),
              formatDate(item.date),
              item.status || 'Pending',
              item.level || item.rank || ''
            ])
        ].map(row => row.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = createElement('a', { href: url, download: `${type}_report.csv` });
        a.click();
        URL.revokeObjectURL(url);
        showMessage(`${type} report exported`, 'success');
      } catch (e) {
        console.error(`Error exporting ${type} report:`, e);
        showMessage(`Failed to export ${type} report`, 'error');
      }
    };

    // Comprehensive backup export function
    const exportCompleteBackup = async () => {
      try {
        showMessage('Preparing complete backup...', 'info');
        
        // Get all users with their complete data
        const usersSnapshot = await db.collection('users').get();
        const users = [];
        
        for (const userDoc of usersSnapshot.docs) {
          const userData = userDoc.data();
          
          // Get user's referrals
          const referralsSnapshot = await db.collection('referrals').where('referrerId', '==', userDoc.id).get();
          const referrals = referralsSnapshot.docs.map(doc => doc.data());
          
          // Get user's deposits
          const depositsSnapshot = await db.collection('deposits').where('userId', '==', userDoc.id).get();
          const deposits = depositsSnapshot.docs.map(doc => doc.data());
          
          // Get user's withdrawals
          const withdrawalsSnapshot = await db.collection('withdrawals').where('userId', '==', userDoc.id).get();
          const withdrawals = withdrawalsSnapshot.docs.map(doc => doc.data());
          
          // Get user's income history
          const incomeSnapshot = await db.collection('income').where('userId', '==', userDoc.id).get();
          const income = incomeSnapshot.docs.map(doc => doc.data());
          
          // Get user's KYC data
          const kycDoc = await db.collection('kyc').doc(userDoc.id).get();
          const kyc = kycDoc.exists ? kycDoc.data() : null;
          
          // Get user's support tickets
          const ticketsSnapshot = await db.collection('tickets').where('userId', '==', userDoc.id).get();
          const tickets = ticketsSnapshot.docs.map(doc => doc.data());
          
          users.push({
            userId: userDoc.id,
            userData: userData,
            referrals: referrals,
            deposits: deposits,
            withdrawals: withdrawals,
            income: income,
            kyc: kyc,
            tickets: tickets
          });
        }
        
        // Create comprehensive backup data
        const backupData = {
          exportDate: new Date().toISOString(),
          totalUsers: users.length,
          users: users,
          adminSettings: {
            roi: (await db.collection('adminSettings').doc('roi').get()).data() || {},
            levelIncome: (await db.collection('adminSettings').doc('levelIncome').get()).data() || {},
            rewards: (await db.collection('adminSettings').doc('rewards').get()).data() || {},
            paymentMethods: (await db.collection('adminSettings').doc('paymentMethods').get()).data() || {}
          }
        };
        
        // Convert to JSON and create download
        const jsonData = JSON.stringify(backupData, null, 2);
        const blob = new Blob([jsonData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = createElement('a', { 
          href: url, 
          download: `complete_backup_${new Date().toISOString().split('T')[0]}.json` 
        });
        a.click();
        URL.revokeObjectURL(url);
        
        showMessage('Complete backup exported successfully!', 'success');
        
      } catch (e) {
        console.error('Error exporting complete backup:', e);
        showMessage('Failed to export complete backup', 'error');
      }
    };

    $('#reportSearchInput')?.addEventListener('input', renderReports);
    $('#exportSelfIncome')?.addEventListener('click', () => exportReport('selfIncome'));
    $('#exportLevelIncome')?.addEventListener('click', () => exportReport('levelIncome'));
    $('#exportReward')?.addEventListener('click', () => exportReport('reward'));
    $('#exportROI')?.addEventListener('click', () => exportReport('roi'));
    $('#exportCompleteBackup')?.addEventListener('click', exportCompleteBackup);

    // Content Management
    const loadContent = async () => {
      try {
        const docSnap = await db.collection('settings').doc('content').get();
        if (docSnap.exists) {
          state.content = docSnap.data();
          const terms = $('#termsContent');
          const about = $('#aboutContent');
          const faq = $('#faqContent');
          const news = $('#newsContent');
          if (terms) terms.value = state.content.terms || '';
          if (about) about.value = state.content.about || '';
          if (faq) faq.value = state.content.faq || '';
          if (news) news.value = state.content.news || '';
        }
      } catch (e) {
        console.error('Error loading content:', e);
        showMessage('Failed to load content', 'error');
      }
    };

    const renderContent = () => {
      try {
        const terms = $('#termsContent');
        const about = $('#aboutContent');
        const faq = $('#faqContent');
        const news = $('#newsContent');
        if (terms) terms.value = state.content.terms || '';
        if (about) about.value = state.content.about || '';
        if (faq) faq.value = state.content.faq || '';
        if (news) news.value = state.content.news || '';
      } catch (e) {
        console.error('Error rendering content:', e);
        showMessage('Failed to render content', 'error');
      }
    };

    $('#contentForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      try {
        const content = {
          terms: DOMPurify ? DOMPurify.sanitize($('#termsContent')?.value) || '' : $('#termsContent')?.value || '',
          about: DOMPurify ? DOMPurify.sanitize($('#aboutContent')?.value) || '' : $('#aboutContent')?.value || '',
          faq: DOMPurify ? DOMPurify.sanitize($('#faqContent')?.value) || '' : $('#faqContent')?.value || '',
          news: DOMPurify ? DOMPurify.sanitize($('#newsContent')?.value) || '' : $('#newsContent')?.value || ''
        };
        await db.collection('settings').doc('content').set(content);
        state.content = content;
        showMessage('Content updated successfully!', 'success');
        await db.collection('notifications').add({
          message: 'Website content has been updated by admin.',
          user: 'all',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      } catch (e) {
        console.error('Error saving content:', e);
        showMessage('Failed to save content', 'error');
      }
    });

    // Communication
    const renderCommunication = () => {
      try {
        const notificationForm = $('#sendNotificationForm');
        if (notificationForm) {
          notificationForm.innerHTML = '';
          notificationForm.appendChild(
            createElement('div', {},
              createElement('label', { for: 'notificationMessage' }, 'Message:'),
              createElement('textarea', { id: 'notificationMessage', required: true }),
              createElement('label', { for: 'notificationTarget' }, 'Target:'),
              createElement('select', { id: 'notificationTarget' },
                createElement('option', { value: 'all' }, 'All Users'),
                ...state.userList.map(u => createElement('option', { value: u.email }, u.email))
              ),
              createElement('button', { type: 'submit', class: 'primary' }, 'Send Notification')
            )
          );
        }
      } catch (e) {
        console.error('Error rendering communication:', e);
        showMessage('Failed to render communication', 'error');
      }
    };

    $('#sendNotificationForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      try {
        const message = DOMPurify ? DOMPurify.sanitize($('#notificationMessage')?.value) : $('#notificationMessage')?.value;
        const target = $('#notificationTarget')?.value;
        if (!message) {
          showMessage('Please enter a message', 'error');
          return;
        }
        await db.collection('notifications').add({
          message,
          user: target,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showMessage('Notification sent!', 'success');
        $('#notificationMessage').value = '';
        loadNotifications();
      } catch (e) {
        console.error('Error sending notification:', e);
        showMessage('Failed to send notification', 'error');
      }
    });

    // Settings
    const loadSettings = async () => {
      try {
        const docSnap = await db.collection('settings').doc('adminSettings').get();
        if (docSnap.exists) {
          state.settings = docSnap.data();
          const enable2fa = $('#enable2fa');
          const passwordPolicy = $('#passwordPolicy');
          if (enable2fa) enable2fa.checked = state.settings.enable2fa || false;
          if (passwordPolicy) passwordPolicy.value = state.settings.passwordPolicy || 'Min 8 chars, 1 uppercase, 1 number, 1 special char';
        }
      } catch (e) {
        console.error('Error loading settings:', e);
        showMessage('Failed to load settings', 'error');
      }
    };

    const renderSettings = () => {
      try {
        const enable2fa = $('#enable2fa');
        const passwordPolicy = $('#passwordPolicy');
        if (enable2fa) enable2fa.checked = state.settings.enable2fa || false;
        if (passwordPolicy) passwordPolicy.value = state.settings.passwordPolicy || 'Min 8 chars, 1 uppercase, 1 number, 1 special char';
        
        // Initialize console control settings
        initializeConsoleControl();
      } catch (e) {
        console.error('Error rendering settings', e);
        showMessage('Failed to render settings', 'error');
      }
    };

    $('#adminSettingsForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      try {
        const settings = {
          enable2fa: $('#enable2fa')?.checked || false,
          passwordPolicy: DOMPurify ? DOMPurify.sanitize($('#passwordPolicy')?.value) || 'Min 8 chars, 1 uppercase, 1 number, 1 special char' : $('#passwordPolicy')?.value || 'Min 8 chars, 1 uppercase, 1 number, 1 special char'
        };
        await db.collection('settings').doc('adminSettings').set(settings);
        state.settings = settings;
        showMessage('Settings saved!', 'success');
      } catch (e) {
        console.error('Error saving settings:', e);
        showMessage('Failed to save settings', 'error');
      }
    });

    // Activity Logs
    const loadActivityLogs = async () => {
      try {
        const snap = await db.collection('activityLogs').orderBy('timestamp', 'desc').limit(50).get();
        state.activityLogs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderActivityLogs();
      } catch (e) {
        console.error('Error loading activity logs:', e);
        showMessage('Failed to load activity logs', 'error');
      }
    };

    const renderActivityLogs = () => {
      try {
        const tbody = $('#activityLogsTableBody');
        if (tbody) {
          tbody.innerHTML = '';
          state.activityLogs.forEach(log => {
            tbody.appendChild(createElement('tr', {},
              createElement('td', {}, log.user || '-'),
              createElement('td', {}, log.action || '-'),
              createElement('td', {}, formatDate(log.timestamp?.toDate())),
              createElement('td', {}, DOMPurify ? DOMPurify.sanitize(log.details) : log.details || '-')
            ));
          });
        }
      } catch (e) {
        console.error('Error rendering activity logs:', e);
        showMessage('Failed to render activity logs', 'error');
      }
    };

    // Support Tickets
    const loadSupportTickets = async () => {
      try {
        // Load tickets from both collections (tickets and supportTickets)
        const [ticketsSnap, supportTicketsSnap] = await Promise.all([
          db.collection('tickets').orderBy('createdAt', 'desc').limit(50).get(),
          db.collection('supportTickets').orderBy('createdAt', 'desc').limit(50).get()
        ]);
        
        const tickets = ticketsSnap.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data(),
          source: 'tickets'
        }));
        
        const supportTickets = supportTicketsSnap.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data(),
          source: 'supportTickets'
        }));
        
        // Combine and sort by date
        state.supportTickets = [...tickets, ...supportTickets]
          .sort((a, b) => {
            const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt) || new Date(0);
            const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt) || new Date(0);
            return dateB - dateA;
          });
        
        renderSupportTickets();
      } catch (e) {
        console.error('Error loading support tickets:', e);
        showMessage('Failed to load support tickets', 'error');
      }
    };

    const renderSupportTickets = () => {
      try {
        console.log('🔄 Rendering support tickets...');
        console.log('📊 Support tickets in state:', state.supportTickets?.length || 0);
        
        const tbody = $('#supportTicketsBody');
        if (!tbody) {
          console.error('❌ Support tickets table body not found');
          return;
        }
        
        tbody.innerHTML = '';
        
        if (!state.supportTickets || state.supportTickets.length === 0) {
          tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px;">No support tickets found</td></tr>';
          console.log('ℹ️ No support tickets to display');
          return;
        }
        
        state.supportTickets
          .filter(ticket => !state.userList.find(u => u.id === ticket.userId)?.isBlocked)
          .forEach((ticket, index) => {
            console.log(`📋 Rendering ticket ${index + 1}:`, {
              id: ticket.id,
              userId: ticket.userId,
              subject: ticket.subject,
              status: ticket.status
            });
            
            // Get user details
            const user = state.userList.find(u => u.id === ticket.userId);
            const userName = user ? user.name : ticket.userName || ticket.user || 'Unknown';
            const userEmail = user ? user.email : ticket.userEmail || 'N/A';
            
            const respondBtn = ticket.status === 'open' || ticket.status === 'pending' ? createElement('button', {
              class: 'small primary',
              onclick: () => respondToTicket(ticket.id, ticket.userId || ticket.user, ticket.source)
            }, 'Respond') : null;
            
            const closeBtn = ticket.status === 'open' || ticket.status === 'pending' ? createElement('button', {
              class: 'small danger',
              onclick: () => closeTicket(ticket.id, ticket.userId || ticket.user, ticket.source)
            }, 'Close') : null;
            
            const viewBtn = createElement('button', {
              class: 'small secondary',
              onclick: () => viewTicketDetails(ticket)
            }, 'View Details');
            
            const row = createElement('tr', {},
              createElement('td', {}, userName),
              createElement('td', {}, userEmail),
              createElement('td', {}, DOMPurify ? DOMPurify.sanitize(ticket.subject) : ticket.subject || '-'),
              createElement('td', {}, DOMPurify ? DOMPurify.sanitize(ticket.message?.substring(0, 100) + (ticket.message?.length > 100 ? '...' : '')) : (ticket.message?.substring(0, 100) + (ticket.message?.length > 100 ? '...' : '')) || '-'),
              createElement('td', {}, formatDate(ticket.createdAt?.toDate?.() || ticket.createdAt)),
              createElement('td', {}, ticket.status || 'open'),
              createElement('td', {}, [viewBtn, respondBtn, closeBtn].filter(Boolean))
            );
            
            tbody.appendChild(row);
          });
          
        console.log('✅ Support tickets rendered successfully');
      } catch (e) {
        console.error('❌ Error rendering support tickets:', e);
        showMessage('Failed to render support tickets', 'error');
      }
    };

    const viewTicketDetails = (ticket) => {
      const modal = createElement('div', { class: 'modal', style: 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10000;' },
        createElement('div', { class: 'modal-content', style: 'background: #2a2f4a; padding: 20px; border-radius: 10px; max-width: 600px; max-height: 80vh; overflow-y: auto;' },
          createElement('h3', { style: 'color: var(--accent); margin-bottom: 15px;' }, 'Support Ticket Details'),
          createElement('div', { style: 'margin-bottom: 15px;' },
            createElement('p', { style: 'font-weight: bold;' }, `User: ${ticket.userName || ticket.user || 'Unknown'}`),
            createElement('p', { style: 'font-weight: bold;' }, `Email: ${ticket.userEmail || 'N/A'}`),
            createElement('p', { style: 'font-weight: bold;' }, `Subject: ${DOMPurify ? DOMPurify.sanitize(ticket.subject) : ticket.subject || 'N/A'}`),
            createElement('p', { style: 'font-weight: bold;' }, `Status: ${ticket.status || 'open'}`),
            createElement('p', { style: 'font-weight: bold;' }, `Date: ${formatDate(ticket.createdAt?.toDate?.() || ticket.createdAt)}`)
          ),
          createElement('div', { style: 'margin-bottom: 15px;' },
            createElement('h4', { style: 'color: var(--accent); margin-bottom: 10px;' }, 'Message:'),
            createElement('p', { style: 'background: rgba(255,255,255,0.1); padding: 10px; border-radius: 5px; white-space: pre-wrap;' }, DOMPurify ? DOMPurify.sanitize(ticket.message) : ticket.message || 'No message')
          ),
          createElement('button', { 
            style: 'background: var(--danger); color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;',
            onclick: () => modal.remove()
          }, 'Close')
        )
      );
      document.body.appendChild(modal);
    };

    const respondToTicket = async (ticketId, user, source = 'tickets') => {
      const modal = createElement('div', { class: 'modal', style: 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center;' },
        createElement('div', { class: 'modal-content', style: 'background: #2a2f4a; padding: 20px; border-radius: 10px; max-width: 400px;' },
          createElement('h3', {}, `Respond to Ticket for ${user}`),
          createElement('form', { id: 'respondTicketForm' },
            createElement('label', { for: 'ticketResponse' }, 'Response:'),
            createElement('textarea', { id: 'ticketResponse', required: true }),
            createElement('button', { type: 'submit', class: 'primary' }, 'Send Response'),
            createElement('button', { type: 'button', class: 'secondary', onclick: () => modal.remove() }, 'Cancel')
          )
        )
      );
      document.body.appendChild(modal);
      $('#respondTicketForm').addEventListener('submit', async e => {
        e.preventDefault();
        try {
          const response = DOMPurify ? DOMPurify.sanitize($('#ticketResponse').value) : $('#ticketResponse').value;
          
          // Update ticket based on source
          const collectionName = source === 'supportTickets' ? 'supportTickets' : 'tickets';
          await db.collection(collectionName).doc(ticketId).update({
            status: 'responded',
            response,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          
          await db.collection('notifications').add({
            message: `Your support ticket has been responded to: ${response}`,
            userId: user,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          
          showMessage('Response sent!', 'success');
          loadSupportTickets();
          modal.remove();
        } catch (e) {
          console.error('Error responding to ticket:', e);
          showMessage('Failed to send response', 'error');
        }
      });
    };

    const closeTicket = async (ticketId, user, source = 'tickets') => {
      try {
        if (!confirm(`Close ticket for ${user}?`)) return;
        
        // Update ticket based on source
        const collectionName = source === 'supportTickets' ? 'supportTickets' : 'tickets';
        await db.collection(collectionName).doc(ticketId).update({
          status: 'closed',
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        await db.collection('notifications').add({
          message: `Your support ticket has been closed.`,
          userId: user,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showMessage(`Ticket for ${user} closed!`, 'success');
        loadSupportTickets();
      } catch (e) {
        console.error('Error closing ticket:', e);
        showMessage('Failed to close ticket', 'error');
      }
    };

    $('#supportTicketSearchInput')?.addEventListener('input', renderSupportTickets);
    $('#refreshSupport')?.addEventListener('click', () => {
      console.log('🔄 Refresh support tickets clicked');
      loadSupportTickets();
      showMessage('Support tickets refreshed', 'success');
    });
    
    // Add debug button event listener
    $('#debugSupportTickets')?.addEventListener('click', () => {
      debugSupportTickets();
    });
    
    // Add test ticket button event listener
    $('#createTestTicket')?.addEventListener('click', () => {
      createTestTicket();
    });

    // Initialize
    initializeApp();

    const renderROI = () => {
      const roiSection = $('#roi');
      if (!roiSection) return;

      // Show enhanced auto-persist status with scheduler information
      const savedSettings = state.roiSettings;
      let autoPersistStatus = '';
      
      if (savedSettings.autoPersist && savedSettings.planType) {
        const lastSaved = savedSettings.updatedAt?.toDate ? savedSettings.updatedAt.toDate() : new Date(savedSettings.updatedAt);
        const schedulerState = localStorage.getItem('roiSchedulerState');
        let schedulerInfo = '';
        
        if (schedulerState) {
          try {
            const state = JSON.parse(schedulerState);
            if (state.isRunning) {
              const startedAt = new Date(state.startedAt);
              const lastRun = state.lastRun ? new Date(state.lastRun) : null;
              const nextRun = state.nextRun ? new Date(state.nextRun) : null;
              
              schedulerInfo = `
                <div style="background: rgba(40, 167, 69, 0.2); padding: 10px; border-radius: 6px; margin-top: 10px; border-left: 4px solid #28a745;">
                  <h5 style="color: #28a745; margin: 0 0 8px 0;">🚀 Scheduler Status: RUNNING</h5>
                  <p style="margin: 3px 0; font-size: 12px;"><strong>Started:</strong> ${startedAt.toLocaleString()}</p>
                  ${lastRun ? `<p style="margin: 3px 0; font-size: 12px;"><strong>Last Run:</strong> ${lastRun.toLocaleString()}</p>` : ''}
                  ${nextRun ? `<p style="margin: 3px 0; font-size: 12px;"><strong>Next Run:</strong> ${nextRun.toLocaleString()}</p>` : ''}
                  <p style="margin: 3px 0; font-size: 12px;"><strong>Status:</strong> ✅ Active and persistent</p>
                </div>
              `;
            }
          } catch (e) {
            console.error('Error parsing scheduler state:', e);
          }
        }
        
        autoPersistStatus = `
          <div style="background: rgba(92, 184, 92, 0.2); padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #5cb85c;">
            <h4 style="color: #5cb85c; margin: 0 0 10px 0;">🔄 Enhanced Auto-Persist Enabled</h4>
            <p style="margin: 5px 0;"><strong>Settings will persist automatically until manually changed by admin.</strong></p>
            <p style="margin: 5px 0;"><strong>Last Saved:</strong> ${lastSaved.toLocaleDateString()} by ${savedSettings.lastSavedBy || 'admin'}</p>
            <p style="margin: 5px 0;"><strong>Settings Version:</strong> ${savedSettings.settingsVersion ? new Date(savedSettings.settingsVersion).toLocaleString() : 'N/A'}</p>
            ${schedulerInfo}
          </div>
        `;
      } else {
        autoPersistStatus = `
          <div style="background: rgba(240, 173, 78, 0.2); padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #f0ad4e;">
            <h4 style="color: #f0ad4e; margin: 0 0 10px 0;">⚠️ Auto-Persist Not Enabled</h4>
            <p style="margin: 5px 0;"><strong>Save your ROI settings to enable automatic persistence.</strong></p>
          </div>
        `;
      }

      roiSection.innerHTML = `
        <h2>ROI Management</h2>
        ${autoPersistStatus}
        <div class="card">
          <h3>ROI Settings</h3>
          <form id="roiSettingsForm" style="max-width: 500px;">
            <div>
              <label for="roiPlanType">Plan Type:</label>
              <select id="roiPlanType" aria-label="Select ROI plan type">
                <option value="daily" ${state.roiSettings.planType === 'daily' ? 'selected' : ''}>Daily</option>
                <option value="weekly" ${state.roiSettings.planType === 'weekly' ? 'selected' : ''}>Weekly</option>
                <option value="monthly" ${state.roiSettings.planType === 'monthly' ? 'selected' : ''}>Monthly</option>
              </select>
            </div>
            <div>
              <label for="roiPercentage">Return (%):</label>
              <input type="number" id="roiPercentage" min="0" max="100" step="0.01" value="${(state.roiSettings.monthlyPercentage || 1.2) * 100}" aria-label="Set ROI percentage" />
            </div>
            <div>
              <label for="roiDuration">Duration (${state.roiSettings.planType || 'days'}):</label>
              <input type="number" id="roiDuration" min="1" max="365" step="1" value="${state.roiSettings.duration || 30}" aria-label="Set ROI duration" />
            </div>
            <div>
              <label for="roiStatus">Status:</label>
              <select id="roiStatus" aria-label="Set ROI status">
                <option value="active" ${state.roiSettings.status === 'active' ? 'selected' : ''}>Active</option>
                <option value="paused" ${state.roiSettings.status === 'paused' ? 'selected' : ''}>Paused</option>
              </select>
            </div>
            <div style="margin-top: 15px; padding: 10px; background: rgba(240, 173, 78, 0.2); border-radius: 5px; border-left: 4px solid #f0ad4e;">
              <small><strong>Note:</strong> Once saved, these settings will persist automatically until manually changed. The system will continue using these settings for daily ROI calculations.</small>
            </div>
            <button type="submit" class="primary">Save ROI Settings</button>
          </form>
          <div style="margin-bottom: 20px;">
            <button onclick="recalculateAllUserROI()" class="secondary">Recalculate All User ROI</button>
            <button onclick="manualROICalculation()" class="warning">Manual ROI Calculation</button>
            <button onclick="checkROIStatus()" class="success">Check ROI Status</button>
            <button onclick="showROISettingsStatus()" class="secondary">Show Settings Status</button>
            <button onclick="checkROISchedulerStatus()" class="primary">Check Scheduler Status</button>
            <button onclick="restartROIScheduler()" class="success">🔄 Restart Scheduler</button>
            <button onclick="stopROIScheduler()" class="danger">Stop Scheduler</button>
          </div>
          <div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px;">
            <h4>Current Settings:</h4>
            <p><strong>Plan Type:</strong> ${state.roiSettings.planType || 'daily'}</p>
            <p><strong>Return Percentage:</strong> ${((state.roiSettings.monthlyPercentage || 1.2) * 100).toFixed(2)}%</p>
            <p><strong>Daily ROI:</strong> ${((state.roiSettings.dailyROI || 0.01) * 100).toFixed(4)}%</p>
            <p><strong>Maximum ROI:</strong> ${((state.roiSettings.maxROI || 0.30) * 100).toFixed(2)}%</p>
            <p><strong>Duration:</strong> ${state.roiSettings.duration || 30} ${state.roiSettings.planType || 'days'}</p>
            <p><strong>Max Days:</strong> ${state.roiSettings.maxDays || 30} days</p>
            <p><strong>Status:</strong> ${state.roiSettings.status || 'active'}</p>
          </div>
        </div>
        <div class="card">
          <h3>ROI History</h3>
          <div id="roiHistoryTable"></div>
        </div>
        
        <div class="card">
          <h3>🚀 Enhanced ROI System Features</h3>
          <div style="padding: 15px; background: rgba(40, 167, 69, 0.1); border-radius: 8px; border-left: 4px solid #28a745;">
            <h4 style="color: #28a745; margin: 0 0 15px 0;">✨ Automatic Persistence System</h4>
            <ul style="margin: 0; padding-left: 20px;">
              <li><strong>🔄 Auto-Restart:</strong> Scheduler automatically restarts when admin panel is reopened</li>
              <li><strong>💾 Cross-Session:</strong> Settings persist across browser sessions and page refreshes</li>
              <li><strong>⏰ Smart Scheduling:</strong> Daily ROI calculations at 10 AM automatically</li>
              <li><strong>🛡️ Error Recovery:</strong> Automatic recovery from interruptions and errors</li>
              <li><strong>📊 Real-time Status:</strong> Live monitoring of scheduler health and performance</li>
            </ul>
            <p style="margin: 15px 0 0 0; font-style: italic; color: #6c757d;">
              <strong>How it works:</strong> Once you save ROI settings, the system automatically runs until you manually change them. 
              The scheduler continues working even when you close the admin panel and will restart automatically when you return.
            </p>
          </div>
        </div>
        
        <div class="card">
          <h3>🔄 Enhanced Scheduler Status</h3>
          <div id="schedulerStatusDisplay" style="padding: 15px; background: rgba(255,255,255,0.05); border-radius: 8px;">
            <p><em>Click "Check Scheduler Status" to view detailed scheduler information</em></p>
          </div>
        </div>
      `;

      // Add form submit handler
      const form = document.getElementById('roiSettingsForm');
      if (form) {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          
          // Check if settings have been modified
          if (checkROISettingsModified()) {
            await saveROISettings();
          } else {
            showMessage('No changes detected in ROI settings. Settings are already saved and will persist automatically.', 'info');
          }
        });
      }

      // Automatically check scheduler status when ROI tab is opened
      setTimeout(() => {
        checkROISchedulerStatus();
      }, 500);

      renderROIHistory();
    };

    // Manual ROI calculation function
    const manualROICalculation = async () => {
      try {
        console.log('🔄 Starting manual ROI calculation...');
        
        // Get all users
        const usersSnapshot = await db.collection('users').get();
        console.log(`📊 Found ${usersSnapshot.size} users for manual ROI calculation`);
        
        let processedUsers = 0;
        let usersWithROI = 0;
        
        for (const userDoc of usersSnapshot.docs) {
          const userData = userDoc.data();
          console.log(`\n👤 Processing user: ${userData.email || userDoc.id}`);
          
          // Calculate ROI for this user
          await calculateUserROI(userDoc.id, userData);
          processedUsers++;
          
          // Check if user has ROI income
          if (userData.roiIncome && userData.roiIncome > 0) {
            usersWithROI++;
          }
        }
        
        console.log(`\n✅ Manual ROI calculation completed!`);
        console.log(`📊 Processed: ${processedUsers} users`);
        console.log(`💰 Users with ROI: ${usersWithROI} users`);
        
        showMessage(`Manual ROI calculation completed! Processed ${processedUsers} users, ${usersWithROI} have ROI income.`, 'success');
        
      } catch (error) {
        console.error('❌ Error in manual ROI calculation:', error);
        showMessage('Error in manual ROI calculation', 'error');
      }
    };

    // Check ROI status function
    const checkROIStatus = async () => {
      try {
        console.log('🔍 Checking ROI status...');
        
        // Check admin ROI settings
        const adminSettingsDoc = await db.collection('adminSettings').doc('roi').get();
        if (!adminSettingsDoc.exists) {
          showMessage('❌ Admin ROI settings not found!', 'error');
          return;
        }
        
        const roiSettings = adminSettingsDoc.data();
        console.log('📊 ROI Settings:', roiSettings);
        
        // Get all users with deposits
        const usersSnapshot = await db.collection('users').get();
        let usersWithDeposits = 0;
        let usersWithROI = 0;
        let totalDeposits = 0;
        let totalROI = 0;
        
        for (const userDoc of usersSnapshot.docs) {
          const userData = userDoc.data();
          
          // Check deposits
          const depositsSnapshot = await db.collection('deposits')
            .where('userId', '==', userDoc.id)
            .where('status', '==', 'approved')
            .get();
          
          if (depositsSnapshot.size > 0) {
            usersWithDeposits++;
            const userDeposits = depositsSnapshot.docs.reduce((sum, doc) => sum + (doc.data().amount || 0), 0);
            totalDeposits += userDeposits;
            
            if (userData.roiIncome && userData.roiIncome > 0) {
              usersWithROI++;
              totalROI += userData.roiIncome;
            }
          }
        }
        
        const statusMessage = `
          📊 ROI Status Report:
          
          ✅ Admin Settings: Active
          📈 Daily ROI: ${((roiSettings.dailyROI || 0.01) * 100).toFixed(4)}%
          🎯 Max ROI: ${((roiSettings.maxROI || 0.30) * 100).toFixed(2)}%
          
          👥 Users with Deposits: ${usersWithDeposits}
          💰 Users with ROI: ${usersWithROI}
          💵 Total Deposits: $${totalDeposits.toFixed(2)}
          📈 Total ROI Paid: $${totalROI.toFixed(2)}
          
          ⏰ Next Calculation: 10 AM daily
        `;
        
        console.log(statusMessage);
        showMessage(statusMessage, 'info');
        
      } catch (error) {
        console.error('❌ Error checking ROI status:', error);
        showMessage('Error checking ROI status', 'error');
      }
    };

    // Debug support tickets function
    const debugSupportTickets = async () => {
      try {
        console.log('🔍 Debugging Support Tickets in Admin Panel...');
        
        // Check if database is initialized
        if (!db) {
          console.error('❌ Database not initialized');
          return;
        }
        
        // Check tickets collection
        const ticketsSnapshot = await db.collection('tickets').get();
        console.log('📝 Tickets collection count:', ticketsSnapshot.size);
        
        ticketsSnapshot.docs.forEach((doc, index) => {
          const ticket = doc.data();
          console.log(`📋 Ticket ${index + 1}:`, {
            id: doc.id,
            userId: ticket.userId,
            userEmail: ticket.userEmail,
            userName: ticket.userName,
            subject: ticket.subject,
            status: ticket.status,
            createdAt: ticket.createdAt?.toDate?.() || ticket.createdAt
          });
        });
        
        // Check supportTickets collection
        const supportTicketsSnapshot = await db.collection('supportTickets').get();
        console.log('📝 SupportTickets collection count:', supportTicketsSnapshot.size);
        
        supportTicketsSnapshot.docs.forEach((doc, index) => {
          const ticket = doc.data();
          console.log(`📋 SupportTicket ${index + 1}:`, {
            id: doc.id,
            userId: ticket.userId,
            userEmail: ticket.userEmail,
            userName: ticket.userName,
            subject: ticket.subject,
            status: ticket.status,
            createdAt: ticket.createdAt?.toDate?.() || ticket.createdAt
          });
        });
        
        // Check current state
        console.log('📊 Current supportTickets state:', state.supportTickets?.length || 0);
        
        // Check HTML elements
        const tbody = $('#supportTicketsBody');
        console.log('🎨 Support tickets table body:', tbody);
        
        const searchInput = $('#supportSearchInput');
        console.log('🔍 Search input:', searchInput);
        
        const refreshBtn = $('#refreshSupport');
        console.log('🔄 Refresh button:', refreshBtn);
        
        // Force reload
        console.log('🔄 Force reloading support tickets...');
        await loadSupportTickets();
        console.log('✅ Support tickets reloaded');
        
        // Show message
        showMessage(`Debug completed! Found ${ticketsSnapshot.size} tickets and ${supportTicketsSnapshot.size} supportTickets`, 'info');
        
      } catch (error) {
        console.error('❌ Error debugging support tickets:', error);
        showMessage('Error debugging support tickets', 'error');
      }
    };

    // Test ticket creation function
    const createTestTicket = async () => {
      try {
        console.log('🧪 Creating test support ticket...');
        
        const testTicket = {
          userId: 'test-user-id',
          userEmail: 'test@example.com',
          userName: 'Test User',
          subject: 'Test Support Ticket',
          message: 'This is a test support ticket to verify the system is working.',
          status: 'open',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection('tickets').add(testTicket);
        console.log('✅ Test ticket created successfully');
        
        // Reload tickets
        await loadSupportTickets();
        showMessage('Test ticket created and loaded!', 'success');
        
      } catch (error) {
        console.error('❌ Error creating test ticket:', error);
        showMessage('Error creating test ticket', 'error');
      }
    };

    // Add global function declarations for onclick handlers
    window.saveROISettings = saveROISettings;
    window.recalculateAllUserROI = recalculateAllUserROI;
    window.closeKycModal = closeKycModal;
    window.manualROICalculation = manualROICalculation;
    window.checkROIStatus = checkROIStatus;
    window.showROISettingsStatus = showROISettingsStatus;
    window.debugSupportTickets = debugSupportTickets;
    window.createTestTicket = createTestTicket;
    window.testConsoleFilter = testConsoleFilter;
    window.resetConsoleFilter = resetConsoleFilter;
    window.injectConsoleFilterToUsers = injectConsoleFilterToUsers;
    
    // Console Toggle Functionality
    const initializeConsoleToggle = () => {
      const toggleBtn = document.getElementById('consoleToggle');
      if (!toggleBtn) {
        console.warn('Console toggle button not found');
        return;
      }

      // Store original console methods
      const originalConsole = {
        log: console.log,
        warn: console.warn,
        error: console.error,
        info: console.info,
        debug: console.debug
      };

      // Function to toggle console logs
      const toggleConsole = (hide) => {
        if (hide) {
          console.log = function() {};
          console.warn = function() {};
          console.error = function() {};
          console.info = function() {};
          console.debug = function() {};
          toggleBtn.title = 'Show Console Logs';
          toggleBtn.classList.add('active');
          originalConsole.log('Console logs are now hidden');
        } else {
          console.log = originalConsole.log;
          console.warn = originalConsole.warn;
          console.error = originalConsole.error;
          console.info = originalConsole.info;
          console.debug = originalConsole.debug;
          toggleBtn.title = 'Hide Console Logs';
          toggleBtn.classList.remove('active');
          originalConsole.log('Console logs are now visible');
        }
        localStorage.setItem('hideConsoleLogs', hide);
      };

      // Load saved state
      const consoleHidden = localStorage.getItem('hideConsoleLogs') === 'true';
      toggleConsole(consoleHidden);

      // Toggle on button click
      toggleBtn.addEventListener('click', function() {
        const currentState = this.classList.contains('active');
        toggleConsole(!currentState);
        
        // Visual feedback
        this.style.transform = 'scale(1.1)';
        setTimeout(() => { this.style.transform = 'scale(1)'; }, 200);
      });

      console.log('Console toggle functionality initialized');
    };

    // Initialize console toggle when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initializeConsoleToggle);
    } else {
      initializeConsoleToggle();
    }
    
    // Event listeners will be set up in initializeApp function
  } catch (e) {
    console.error('Firebase initialization failed:', e);
    // Use console.error instead of showMessage since it might not be available
    console.error('Failed to initialize Firebase:', e);
  }
}