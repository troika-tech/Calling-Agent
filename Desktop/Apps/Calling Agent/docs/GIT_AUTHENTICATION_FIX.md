# Fix GitHub Authentication Error

## Problem
```
remote: Invalid username or token. Password authentication is not supported for Git operations.
fatal: Authentication failed for 'https://github.com/ENZ048/Calling-Agent.git/'
```

GitHub no longer accepts password authentication for Git operations. You need to use a **Personal Access Token (PAT)** instead.

---

## Quick Fix Options

### Option 1: Use SSH Instead (Recommended)

**Step 1: Generate SSH Key (if you don't have one)**
```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
# Press Enter to accept default location
# Press Enter twice for no passphrase (or set one)
```

**Step 2: Copy SSH Public Key**
```bash
cat ~/.ssh/id_ed25519.pub
# Copy the entire output
```

**Step 3: Add SSH Key to GitHub**
1. Go to https://github.com/settings/keys
2. Click "New SSH key"
3. Paste your public key
4. Click "Add SSH key"

**Step 4: Change Remote URL to SSH**
```bash
cd ~/calling-agent/backend

# Check current remote
git remote -v

# Change to SSH
git remote set-url origin git@github.com:ENZ048/Calling-Agent.git

# Test connection
ssh -T git@github.com

# Now pull should work
git pull
```

---

### Option 2: Use Personal Access Token (PAT)

**Step 1: Create Personal Access Token**
1. Go to https://github.com/settings/tokens
2. Click "Generate new token" → "Generate new token (classic)"
3. Give it a name (e.g., "Calling Agent Deploy")
4. Select scopes:
   - ✅ `repo` (Full control of private repositories)
5. Set expiration (30/60/90 days or No expiration)
6. Click "Generate token"
7. **COPY THE TOKEN NOW** (you won't see it again!)

**Step 2: Use Token as Password**
```bash
cd ~/calling-agent/backend

git pull
# Username: EnZ048
# Password: <paste your token here, not your GitHub password>
```

**Step 3: Store Credentials (Optional)**
```bash
# Cache credentials for 1 hour
git config --global credential.helper 'cache --timeout=3600'

# OR store permanently (less secure)
git config --global credential.helper store

# Next time you git pull, it won't ask again
```

---

### Option 3: Use GitHub CLI (Easiest)

**Step 1: Install GitHub CLI**
```bash
# For Ubuntu
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update
sudo apt install gh
```

**Step 2: Authenticate**
```bash
gh auth login
# Select: GitHub.com
# Select: HTTPS
# Select: Login with a web browser
# Copy the code and press Enter
# Browser will open, paste code and authorize
```

**Step 3: Pull**
```bash
cd ~/calling-agent/backend
git pull
```

---

## Which Option to Choose?

### Use SSH if:
- ✅ You want long-term convenience
- ✅ You work with multiple repos
- ✅ You value security (no password storage)
- **Recommended for servers**

### Use PAT if:
- ✅ Quick setup needed
- ✅ You're already using HTTPS
- ✅ You need fine-grained permissions

### Use GitHub CLI if:
- ✅ You want the easiest setup
- ✅ You use GitHub features often
- ✅ You want automatic token management

---

## Detailed Steps for SSH (Recommended)

### On Your Ubuntu Server

**1. Generate SSH Key Pair**
```bash
ssh-keygen -t ed25519 -C "pratik.yesare68@gmail.com"

# Output:
# Generating public/private ed25519 key pair.
# Enter file in which to save the key (/home/ubuntu/.ssh/id_ed25519): [Press Enter]
# Enter passphrase (empty for no passphrase): [Press Enter]
# Enter same passphrase again: [Press Enter]
```

**2. Display Your Public Key**
```bash
cat ~/.ssh/id_ed25519.pub

# Output will look like:
# ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFoo...bar== pratik.yesare68@gmail.com
```

**Copy everything** from `ssh-ed25519` to the end

**3. Add Key to GitHub**
1. Open browser: https://github.com/settings/ssh/new
2. Title: "Ubuntu Server - Calling Agent"
3. Key type: Authentication Key
4. Key: Paste the public key
5. Click "Add SSH key"

**4. Update Git Remote to Use SSH**
```bash
cd ~/calling-agent/backend

# View current remote
git remote -v
# Output:
# origin  https://github.com/ENZ048/Calling-Agent.git (fetch)
# origin  https://github.com/ENZ048/Calling-Agent.git (push)

# Change to SSH
git remote set-url origin git@github.com:ENZ048/Calling-Agent.git

# Verify change
git remote -v
# Output:
# origin  git@github.com:ENZ048/Calling-Agent.git (fetch)
# origin  git@github.com:ENZ048/Calling-Agent.git (push)
```

**5. Test SSH Connection**
```bash
ssh -T git@github.com

# First time will ask:
# The authenticity of host 'github.com (...)' can't be established.
# Are you sure you want to continue connecting (yes/no/fingerprint)?
# Type: yes

# Expected output:
# Hi ENZ048! You've successfully authenticated, but GitHub does not provide shell access.
```

**6. Pull Code**
```bash
git pull

# Should work without asking for password!
```

---

## Detailed Steps for Personal Access Token

### Create Token

**1. Go to GitHub Token Settings**
```
https://github.com/settings/tokens
```

**2. Click "Generate new token (classic)"**

**3. Configure Token**
- Note: `calling-agent-deploy`
- Expiration: `No expiration` (or your preference)
- Select scopes:
  - ✅ `repo` - Full control of private repositories

**4. Generate and Copy Token**
- Click "Generate token"
- **IMPORTANT:** Copy the token NOW (ghp_xxxxxxxxxxxx)
- Save it somewhere safe (you won't see it again)

### Use Token

**1. Pull with Token**
```bash
cd ~/calling-agent/backend

git pull
# Username for 'https://github.com': EnZ048
# Password for 'https://EnZ048@github.com': ghp_your_token_here
```

**2. Cache Credentials (Optional)**
```bash
# Cache for 8 hours
git config --global credential.helper 'cache --timeout=28800'

# Next pull won't ask for password
git pull
```

**3. Or Store Permanently**
```bash
# Store credentials in plain text (less secure, but convenient)
git config --global credential.helper store

git pull
# Enter username and token one last time
# Future pulls won't ask again
```

---

## Troubleshooting

### "Permission denied (publickey)"
```bash
# Check if SSH key is loaded
ssh-add -l

# If empty, add your key
ssh-add ~/.ssh/id_ed25519

# Retry
git pull
```

### "Could not read from remote repository"
```bash
# Check SSH connection
ssh -vT git@github.com

# Check remote URL is correct
git remote -v

# Should be: git@github.com:ENZ048/Calling-Agent.git
```

### "Support for password authentication was removed"
- This means you're using HTTPS with a password
- **Solution:** Use SSH or PAT (see above)

### Token Expired
- GitHub tokens can expire
- Create a new token: https://github.com/settings/tokens
- Use the new token as password

---

## Quick Reference

### Commands for Future Use

**Pull latest code:**
```bash
cd ~/calling-agent/backend
git pull
```

**Push your changes:**
```bash
cd ~/calling-agent/backend
git add .
git commit -m "Your commit message"
git push
```

**Check remote URL:**
```bash
git remote -v
```

**Switch between HTTPS and SSH:**
```bash
# To HTTPS
git remote set-url origin https://github.com/ENZ048/Calling-Agent.git

# To SSH
git remote set-url origin git@github.com:ENZ048/Calling-Agent.git
```

---

## For Your Specific Case

Based on your error, here's the fastest solution:

### Quick Fix (3 minutes)

```bash
# 1. Generate SSH key
ssh-keygen -t ed25519 -C "pratik.yesare68@gmail.com"
# Press Enter 3 times (accept defaults, no passphrase)

# 2. Display public key
cat ~/.ssh/id_ed25519.pub

# 3. Copy the output and add to GitHub:
#    https://github.com/settings/ssh/new

# 4. Change to SSH
cd ~/calling-agent/backend
git remote set-url origin git@github.com:ENZ048/Calling-Agent.git

# 5. Test and pull
ssh -T git@github.com  # Type 'yes' when asked
git pull  # Should work now!
```

---

## Security Best Practices

### SSH Keys (Most Secure)
- ✅ Use passphrase-protected keys in production
- ✅ One key per machine
- ✅ Rotate keys periodically
- ✅ Delete old keys from GitHub

### Personal Access Tokens
- ✅ Set expiration dates
- ✅ Use minimal required scopes
- ✅ Rotate tokens regularly
- ✅ Revoke unused tokens
- ✅ Don't commit tokens to code

### Credential Storage
- ⚠️ `credential.helper store` stores in plain text
- ✅ `credential.helper cache` more secure (temporary)
- ✅ SSH keys preferred over stored passwords

---

## Next Steps After Fix

Once authentication is working:

```bash
# Pull latest changes
cd ~/calling-agent/backend
git pull

# Install any new dependencies
npm install

# Rebuild
npm run build

# Restart backend
pm2 restart backend
# or
npm run dev
```

---

## Need Help?

If you're still having issues:

1. **Check GitHub Status:** https://www.githubstatus.com/
2. **Verify Repository Access:** Can you access https://github.com/ENZ048/Calling-Agent in browser?
3. **Check Firewall:** Is SSH (port 22) allowed?
   ```bash
   telnet github.com 22
   ```
4. **Verify Git Config:**
   ```bash
   git config --list | grep user
   git config --list | grep credential
   ```

---

## Summary

**Problem:** GitHub removed password authentication

**Solution:** Use SSH keys or Personal Access Token

**Recommended:** SSH (one-time setup, permanent convenience)

**Quick Command:**
```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
cat ~/.ssh/id_ed25519.pub  # Add to https://github.com/settings/keys
cd ~/calling-agent/backend
git remote set-url origin git@github.com:ENZ048/Calling-Agent.git
git pull
```

That's it! Your git authentication should now work. 🚀
