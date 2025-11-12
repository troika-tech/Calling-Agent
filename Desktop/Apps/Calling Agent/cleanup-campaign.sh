#!/bin/bash

# Cleanup script for stuck campaign slots
# Usage: ./cleanup-campaign.sh <campaignId> <authToken>

if [ -z "$1" ] || [ -z "$2" ]; then
  echo "Usage: ./cleanup-campaign.sh <campaignId> <authToken>"
  exit 1
fi

CAMPAIGN_ID=$1
AUTH_TOKEN=$2
BASE_URL="https://calling-api.0804.in/api/v1"

echo "============================================"
echo "Campaign Slot Cleanup Script"
echo "============================================"
echo ""

# Get Redis state
echo "📊 Checking current Redis state..."
echo ""
curl -s -X GET "${BASE_URL}/maintenance/redis-state/${CAMPAIGN_ID}" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "Content-Type: application/json" | jq '.'

echo ""
echo "============================================"
echo ""
read -p "Do you want to clean up stuck slots? (y/n): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo ""
  echo "🧹 Cleaning up stuck slots..."
  echo ""
  curl -s -X POST "${BASE_URL}/maintenance/cleanup-slots/${CAMPAIGN_ID}" \
    -H "Authorization: Bearer ${AUTH_TOKEN}" \
    -H "Content-Type: application/json" | jq '.'

  echo ""
  echo "============================================"
  echo ""
  echo "✅ Cleanup complete! Checking final state..."
  echo ""

  curl -s -X GET "${BASE_URL}/maintenance/redis-state/${CAMPAIGN_ID}" \
    -H "Authorization: Bearer ${AUTH_TOKEN}" \
    -H "Content-Type: application/json" | jq '.'
else
  echo "Cleanup cancelled."
fi

echo ""
echo "============================================"
