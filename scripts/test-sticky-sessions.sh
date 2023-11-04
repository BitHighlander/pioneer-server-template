#!/bin/bash

# Define the base URL
BASE_URL="https://deployfast.co/api/v1/health"

# Number of requests to make
NUM_REQUESTS=10

# Initialize variables to track server instances
PREVIOUS_SERVER=""
SESSION_COOKIE_FILE=$(mktemp)  # Create a temporary file for storing cookies

# Flag to track sticky sessions
STICKY_SESSIONS_DETECTED=0

# Loop to make requests
for ((i=1; i<=$NUM_REQUESTS; i++)); do
    echo "Making Request $i..."

    # Send a request to the URL, include the previous session cookie if available
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -b "$SESSION_COOKIE_FILE" -c "$SESSION_COOKIE_FILE" -H "Connection: keep-alive" $BASE_URL)

    if [ "$RESPONSE" -eq "200" ]; then
        echo "Request $i: Success (Status Code: $RESPONSE)"
    else
        echo "Request $i: Failure (Status Code: $RESPONSE)"
    fi

    # Extract the Set-Cookie header to capture the session cookie
    NEW_COOKIE=$(curl -s -I -H "Connection: keep-alive" $BASE_URL | grep -i "Set-Cookie" | sed 's/Set-Cookie: //i')

    # Check if the server instance changed
    if [ "$NEW_COOKIE" != "$SESSION_COOKIE" ]; then
        echo "Server instance changed: $NEW_COOKIE"
        SESSION_COOKIE="$NEW_COOKIE"
        echo "$SESSION_COOKIE" > "$SESSION_COOKIE_FILE"

        if [ "$STICKY_SESSIONS_DETECTED" -eq 0 ]; then
            STICKY_SESSIONS_DETECTED=1
        fi
    fi

    sleep 1  # Add a delay between requests if needed
done

# Clean up temporary file
rm "$SESSION_COOKIE_FILE"

if [ "$STICKY_SESSIONS_DETECTED" -eq 1 ]; then
    echo "Sticky sessions are detected."
else
    echo "No sticky sessions detected."
fi

echo "Testing completed."
