let debounceTimer;
const patternInput = document.getElementById('pattern');
const testDataInput = document.getElementById('testData');
const outputDiv = document.getElementById('output');
const statusSpan = document.getElementById('status');

let availablePatterns = [];
let autocompleteList = null;
let selectedIndex = -1;

function updateStatus(message, type = 'info') {
    statusSpan.textContent = message;
    statusSpan.className = 'text-sm font-semibold px-3 py-1 rounded-full ';
    
    switch(type) {
        case 'loading':
            statusSpan.className += 'bg-orange-100 text-orange-700';
            break;
        case 'success':
            statusSpan.className += 'bg-green-100 text-green-700';
            break;
        case 'error':
            statusSpan.className += 'bg-red-100 text-red-700';
            break;
        case 'warning':
            statusSpan.className += 'bg-yellow-100 text-yellow-700';
            break;
        default:
            statusSpan.className += 'bg-blue-100 text-blue-700';
    }
}

function formatOutput(data) {
    if (!data.success) {
        return `<div class="bg-red-50 border-l-4 border-red-500 p-4 rounded">
            <strong class="text-red-800">Error:</strong><br>
            <span class="text-red-700">${escapeHtml(data.error)}</span>
        </div>`;
    }
    
    if (!data.matches || data.matches.length === 0) {
        return `<div class="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded">
            <strong class="text-yellow-800">No Match:</strong><br>
            <span class="text-yellow-700">${escapeHtml(data.error || 'Pattern did not match the test data')}</span>
            ${data.total ? `<br><br><span class="text-yellow-600">Total lines: ${data.total}, Matched: ${data.matched}</span>` : ''}
        </div>`;
    }
    
    let html = `<div class="bg-green-50 border-l-4 border-green-500 p-4 rounded mb-4">
        <strong class="text-green-800">✓ Pattern Matched! (${data.matched} of ${data.total} lines)</strong>
    </div>`;
    
    // Color palette for field highlighting
    const fieldColors = [
        { bg: 'bg-blue-100', text: 'text-blue-900', border: 'border-blue-300' },
        { bg: 'bg-green-100', text: 'text-green-900', border: 'border-green-300' },
        { bg: 'bg-purple-100', text: 'text-purple-900', border: 'border-purple-300' },
        { bg: 'bg-pink-100', text: 'text-pink-900', border: 'border-pink-300' },
        { bg: 'bg-yellow-100', text: 'text-yellow-900', border: 'border-yellow-300' },
        { bg: 'bg-indigo-100', text: 'text-indigo-900', border: 'border-indigo-300' },
        { bg: 'bg-red-100', text: 'text-red-900', border: 'border-red-300' },
        { bg: 'bg-orange-100', text: 'text-orange-900', border: 'border-orange-300' },
        { bg: 'bg-teal-100', text: 'text-teal-900', border: 'border-teal-300' },
        { bg: 'bg-cyan-100', text: 'text-cyan-900', border: 'border-cyan-300' },
    ];
    
    // Get all unique field names across all matches
    const allFields = new Set();
    data.matches.forEach(match => {
        Object.keys(match).forEach(key => allFields.add(key));
    });
    
    // Assign colors to fields
    const fieldColorMap = {};
    Array.from(allFields).forEach((field, index) => {
        fieldColorMap[field] = fieldColors[index % fieldColors.length];
    });
    
    // Get test data lines
    const testDataLines = testDataInput.value.split('\n').filter(line => line.trim());
    
    // Show results for each matched line
    data.matches.forEach((match, index) => {
        const originalLine = testDataLines[index] || '';
        
        html += `<div class="mb-5 bg-white rounded-lg overflow-hidden shadow-sm">`;
        html += `<div class="bg-indigo-600 text-white px-4 py-2 font-semibold text-sm">Match ${index + 1}</div>`;
        
        // Highlighted line preview
        html += `<div class="p-3 bg-gray-50 border-b border-gray-200">`;
        html += `<div class="font-mono text-xs leading-relaxed break-all">`;
        html += highlightMatchedLine(originalLine, match, fieldColorMap);
        html += `</div></div>`;
        
        // Field table
        html += '<table class="w-full">';
        html += '<thead><tr class="bg-gray-100"><th class="px-3 py-2 text-left text-xs font-semibold text-gray-700">Field</th><th class="px-3 py-2 text-left text-xs font-semibold text-gray-700">Value</th><th class="px-3 py-2 text-left text-xs font-semibold text-gray-700">Type</th></tr></thead>';
        html += '<tbody>';
        
        for (const [key, value] of Object.entries(match)) {
            const type = typeof value;
            const displayValue = value === null ? '<em class="text-gray-400">null</em>' : escapeHtml(String(value));
            const colors = fieldColorMap[key];
            
            html += `<tr class="border-b border-gray-200 hover:bg-gray-50">
                <td class="px-3 py-2">
                    <span class="inline-block px-2 py-1 rounded font-semibold text-xs ${colors.bg} ${colors.text} border ${colors.border}">
                        ${escapeHtml(key)}
                    </span>
                </td>
                <td class="px-3 py-2 text-gray-800 break-all">${displayValue}</td>
                <td class="px-3 py-2 text-gray-500 italic text-xs">${type}</td>
            </tr>`;
        }
        
        html += '</tbody></table></div>';
    });
    
    return html;
}

function highlightMatchedLine(line, match, fieldColorMap) {
    if (!line) return '';
    
    // Create an array of segments to highlight
    const segments = [];
    
    // For each field in the match, try to find it in the original line
    for (const [field, value] of Object.entries(match)) {
        if (value === null || value === '') continue;
        
        const valueStr = String(value);
        let startIndex = line.indexOf(valueStr);
        
        if (startIndex !== -1) {
            segments.push({
                start: startIndex,
                end: startIndex + valueStr.length,
                field: field,
                value: valueStr
            });
        }
    }
    
    // Sort segments by start position
    segments.sort((a, b) => a.start - b.start);
    
    // Merge overlapping segments (keep the first one)
    const mergedSegments = [];
    segments.forEach(seg => {
        if (mergedSegments.length === 0 || seg.start >= mergedSegments[mergedSegments.length - 1].end) {
            mergedSegments.push(seg);
        }
    });
    
    // Build highlighted HTML
    let result = '';
    let lastIndex = 0;
    
    mergedSegments.forEach(seg => {
        // Add unmatched part
        if (seg.start > lastIndex) {
            result += escapeHtml(line.substring(lastIndex, seg.start));
        }
        
        // Add highlighted part
        const colors = fieldColorMap[seg.field];
        result += `<span class="inline-block px-1 rounded ${colors.bg} ${colors.text} border ${colors.border}" title="${escapeHtml(seg.field)}">${escapeHtml(seg.value)}</span>`;
        
        lastIndex = seg.end;
    });
    
    // Add remaining unmatched part
    if (lastIndex < line.length) {
        result += escapeHtml(line.substring(lastIndex));
    }
    
    return result;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function testPattern() {
    const pattern = patternInput.value.trim();
    const testData = testDataInput.value.trim();
    
    if (!pattern || !testData) {
        outputDiv.innerHTML = '<div class="text-gray-500 text-center py-10 italic">Enter both a pattern and test data to see results...</div>';
        updateStatus('Ready', 'info');
        return;
    }
    
    updateStatus('Testing...', 'loading');
    
    fetch('/api/test', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            pattern: pattern,
            testData: testData
        })
    })
    .then(response => response.json())
    .then(data => {
        outputDiv.innerHTML = formatOutput(data);
        if (data.success && data.matches && data.matches.length > 0) {
            updateStatus(`${data.matched}/${data.total} matched`, 'success');
        } else if (!data.success) {
            updateStatus('Error', 'error');
        } else {
            updateStatus('No match', 'warning');
        }
    })
    .catch(error => {
        outputDiv.innerHTML = `<div class="bg-red-50 border-l-4 border-red-500 p-4 rounded">
            <strong class="text-red-800">Request Error:</strong><br>
            <span class="text-red-700">${escapeHtml(error.message)}</span>
        </div>`;
        updateStatus('Error', 'error');
    });
}

function handleInput() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(testPattern, 300);
}

// Autocomplete functions
function loadPatternNames() {
    fetch('/api/patterns')
        .then(response => response.text())
        .then(text => {
            const lines = text.split('\n');
            availablePatterns = lines
                .filter(line => line && !line.startsWith('#'))
                .map(line => line.split(' ')[0])
                .filter(name => name && name.length > 0)
                .sort();
        })
        .catch(err => console.error('Failed to load patterns:', err));
}

function createAutocompleteList() {
    if (!autocompleteList) {
        autocompleteList = document.getElementById('autocomplete-list');
    }
    return autocompleteList;
}

function hideAutocomplete() {
    if (autocompleteList) {
        autocompleteList.classList.add('hidden');
        autocompleteList.innerHTML = '';
        selectedIndex = -1;
    }
}

function showAutocomplete(suggestions, searchTerm) {
    const list = createAutocompleteList();
    list.innerHTML = '';
    selectedIndex = -1;
    
    if (suggestions.length === 0) {
        hideAutocomplete();
        return;
    }
    
    suggestions.forEach((pattern, index) => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item px-4 py-2.5 cursor-pointer border-b border-gray-100 font-mono text-sm transition-colors hover:bg-indigo-50 hover:text-indigo-600';
        
        // Highlight matching part
        const matchIndex = pattern.toLowerCase().indexOf(searchTerm.toLowerCase());
        if (matchIndex !== -1) {
            const before = pattern.substring(0, matchIndex);
            const match = pattern.substring(matchIndex, matchIndex + searchTerm.length);
            const after = pattern.substring(matchIndex + searchTerm.length);
            item.innerHTML = `${escapeHtml(before)}<strong class="text-indigo-600 font-bold">${escapeHtml(match)}</strong>${escapeHtml(after)}`;
        } else {
            item.textContent = pattern;
        }
        
        item.addEventListener('click', () => {
            insertPattern(pattern);
            hideAutocomplete();
        });
        
        list.appendChild(item);
    });
    
    list.classList.remove('hidden');
}

function insertPattern(patternName) {
    const textarea = patternInput;
    const cursorPos = textarea.selectionStart;
    const textBefore = textarea.value.substring(0, cursorPos);
    const textAfter = textarea.value.substring(cursorPos);
    
    // Find the start of the current pattern reference
    const lastBraceIndex = textBefore.lastIndexOf('%{');
    if (lastBraceIndex !== -1) {
        const beforePattern = textBefore.substring(0, lastBraceIndex + 2);
        const newValue = beforePattern + patternName + ':}' + textAfter;
        textarea.value = newValue;
        
        // Position cursor after the colon
        const newCursorPos = beforePattern.length + patternName.length + 1;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
        textarea.focus();
    }
}

function handlePatternInput(e) {
    const textarea = e.target;
    const cursorPos = textarea.selectionStart;
    const textBefore = textarea.value.substring(0, cursorPos);
    
    // Check if we're inside a pattern reference
    const lastBraceIndex = textBefore.lastIndexOf('%{');
    const lastCloseBraceIndex = textBefore.lastIndexOf('}');
    
    if (lastBraceIndex > lastCloseBraceIndex && lastBraceIndex !== -1) {
        // We're inside a pattern reference
        const searchTerm = textBefore.substring(lastBraceIndex + 2);
        
        // Don't show autocomplete if there's a colon (field name part)
        if (searchTerm.indexOf(':') === -1) {
            const filtered = availablePatterns.filter(p => 
                p.toLowerCase().includes(searchTerm.toLowerCase())
            );
            showAutocomplete(filtered, searchTerm);
        } else {
            hideAutocomplete();
        }
    } else {
        hideAutocomplete();
    }
    
    handleInput();
}

function handlePatternKeyDown(e) {
    if (!autocompleteList || autocompleteList.classList.contains('hidden')) {
        return;
    }
    
    const items = autocompleteList.querySelectorAll('.autocomplete-item');
    
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
        updateSelectedItem(items);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, -1);
        updateSelectedItem(items);
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
        e.preventDefault();
        items[selectedIndex].click();
    } else if (e.key === 'Escape') {
        hideAutocomplete();
    }
}

function updateSelectedItem(items) {
    items.forEach((item, index) => {
        if (index === selectedIndex) {
            item.classList.add('bg-indigo-50', 'text-indigo-600');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('bg-indigo-50', 'text-indigo-600');
        }
    });
}

// Add event listeners
patternInput.addEventListener('input', handlePatternInput);
patternInput.addEventListener('keydown', handlePatternKeyDown);
testDataInput.addEventListener('input', handleInput);

// Close autocomplete when clicking outside
document.addEventListener('click', (e) => {
    if (e.target !== patternInput && !autocompleteList?.contains(e.target)) {
        hideAutocomplete();
    }
});

// Load example on page load
window.addEventListener('DOMContentLoaded', () => {
    loadPatternNames();
    patternInput.value = '%{IPORHOST:remote_addr} %{DATA:remote_host} %{DATA:remote_user} [%{HTTPDATE:timestamp}] "%{DATA:http_method} %{DATA:request} %{DATA:http_version}" %{INT:status} %{INT:body_bytes_sent} "%{DATA:http_referer}" "%{DATA:user_agent}"';
    testDataInput.value = `173.249.11.249 - - [26/Jan/2026:10:08:49 +0800] "GET /zend/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php HTTP/1.1" 401 633 "-" "libretail-http"
173.249.11.249 - - [26/Jan/2026:10:08:49 +0800] "GET /ws/ec/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php HTTP/1.1" 401 633 "-" "libretail-http"
173.249.11.249 - - [26/Jan/2026:10:08:50 +0800] "GET /V2/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php HTTP/1.1" 401 633 "-" "libretail-http"`;
    testPattern();
});
