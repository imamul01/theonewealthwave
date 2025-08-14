# Firebase Database Check Guide

## 🔍 Firebase Console Access

### 1. Firebase Console Login
- Go to: https://console.firebase.google.com/
- Login with your Google account
- Select project: `theonewealthwave-bad63`

### 2. Navigate to Firestore Database
- Click on "Firestore Database" in the left sidebar
- Click on "Start collection" if no collections exist

## 📊 Collections to Check

### 1. `users` Collection
**Purpose**: Stores all user information and referral data

**Structure**:
```javascript
{
  userId: "USER1234567890",
  uid: "firebase_auth_uid",
  email: "user@example.com",
  name: "User Name",
  country: "India",
  referralCode: "REF12345678",
  referrerId: "USER9876543210",        // Who referred this user
  referrerCode: "REF98765432",         // Referrer's referral code
  referrerName: "Referrer Name",       // Referrer's name
  referralDate: "2024-01-15T10:30:00Z", // When user was referred
  createdAt: "2024-01-15T10:30:00Z",
  status: "active",
  balance: 0,
  totalEarnings: 0,
  totalReferrals: 0,
  level: 1
}
```

**What to Check**:
- ✅ Users are being created with proper referral codes
- ✅ Referrer information is being saved correctly
- ✅ Referral dates are being recorded
- ✅ User levels are being set correctly

### 2. `referrals` Collection
**Purpose**: Stores referral relationships between users

**Structure**:
```javascript
{
  referrerId: "USER9876543210",
  referrerCode: "REF98765432",
  referrerName: "Referrer Name",
  referredId: "USER1234567890",
  referredCode: "REF12345678",
  referredName: "Referred User Name",
  createdAt: "2024-01-15T10:30:00Z",
  status: "active"
}
```

**What to Check**:
- ✅ Referral records are being created
- ✅ Both referrer and referred user information is correct
- ✅ Referral dates are being recorded
- ✅ Status is set to "active"

## 🔧 How to Check Database

### Step 1: Check Users Collection
1. In Firebase Console, go to Firestore Database
2. Click on `users` collection
3. Look for documents with user data
4. Verify each user has:
   - Unique `referralCode`
   - Proper `referrerId`, `referrerCode`, `referrerName` (if referred)
   - Correct `referralDate` (if referred)
   - Proper `level` (1 for direct users, 2+ for referred users)

### Step 2: Check Referrals Collection
1. Click on `referrals` collection
2. Look for referral relationship documents
3. Verify each referral has:
   - Correct `referrerId` and `referredId`
   - Matching `referrerCode` and `referredCode`
   - Proper names for both users
   - Correct `createdAt` timestamp

### Step 3: Test Referral Chain
1. Find a user who has referrals
2. Note their `referralCode`
3. Look in `referrals` collection for documents where `referrerCode` matches
4. For each referred user, check their `level` (should be referrer's level + 1)
5. Verify the chain continues properly

## 🧪 Testing Commands

### Console Commands to Test
```javascript
// Create test data
quickTest.createData()

// Test registration
quickTest.testReg()

// Test team loading
quickTest.testTeam()

// Test logout
quickTest.testLogout()

// Run all tests
quickTest.runAll()
```

### Manual Testing Steps
1. **Register a new user** with a referral code
2. **Check Firebase Console** - verify user document is created
3. **Check referrals collection** - verify referral record is created
4. **Login with referrer** - check if team shows the new user
5. **Check analytics** - verify team size and referral counts

## 🚨 Common Issues and Solutions

### Issue 1: Users not showing in team
**Check**:
- User document has correct `referrerId`, `referrerCode`, `referrerName`
- Referral record exists in `referrals` collection
- User's `referralCode` matches `referredCode` in referral record

### Issue 2: Referral processing not working
**Check**:
- Referrer exists in `users` collection
- Referrer's `referralCode` matches the code used during registration
- User document is being updated with referrer information

### Issue 3: Team levels not showing correctly
**Check**:
- User's `level` field is set correctly (1 for direct, 2+ for referred)
- Referral chain is properly established
- All users in chain have proper `referrerId` and `level` values

### Issue 4: Analytics not updating
**Check**:
- Team members are being counted correctly
- User's `totalReferrals` field is being updated
- Analytics UI elements exist and are being updated

## 📋 Database Rules Check

### Current Rules (should be in firestore.rules):
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Allow public read/write for users and referrals
    match /users/{document} {
      allow read, write: if true;
    }
    
    match /referrals/{document} {
      allow read, write: if true;
    }
    
    // Other collections require authentication
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## 🔍 Debugging Commands

### Check Current User Data
```javascript
// In browser console
console.log('Current User:', currentUser);
console.log('User Data:', userData);
```

### Check Team Data
```javascript
// In browser console
userDataManager.loadTeamData();
```

### Check Firebase Connection
```javascript
// In browser console
console.log('Firebase:', firebase);
console.log('Auth:', firebase.auth());
console.log('Firestore:', firebase.firestore());
```

## ✅ Success Indicators

### Registration Success
- ✅ User document created in `users` collection
- ✅ Referral record created in `referrals` collection (if referral code provided)
- ✅ User's referrer information properly saved
- ✅ User's level set correctly

### Team Loading Success
- ✅ Team members appear in "My Referrals" table
- ✅ Correct levels shown for each team member
- ✅ Join dates displayed correctly
- ✅ Team size updated in analytics

### Analytics Success
- ✅ Total team size shows correct number
- ✅ Active team members counted correctly
- ✅ Upline information displays properly
- ✅ Referral counts updated

## 🎯 Expected Results

After running tests, you should see:

1. **Users Collection**: Multiple user documents with proper referral data
2. **Referrals Collection**: Referral relationship documents
3. **Team Display**: Users showing in "My Referrals" section
4. **Analytics**: Correct team sizes and referral counts
5. **Console Logs**: Success messages without errors

## 🚀 Next Steps

1. **Run the test commands** in browser console
2. **Check Firebase Console** for data creation
3. **Verify team display** in the application
4. **Test manual registration** with referral codes
5. **Monitor console logs** for any errors

If everything works correctly, your referral system should be fully functional! 