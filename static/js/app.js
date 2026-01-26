let debounceTimer;
const patternInput = document.getElementById('pattern');
const testDataInput = document.getElementById('testData');
const outputDiv = document.getElementById('output');
const statusSpan = document.getElementById('status');
const testDataHighlights = document.getElementById('testDataHighlights');
const testDataHighlightContent = document.getElementById('testDataHighlightContent');
const testDataLineNumbers = document.getElementById('testDataLineNumbers');
const testDataLineNumberContent = document.getElementById('testDataLineNumberContent');
const outputViewTableButton = document.getElementById('outputViewTable');
const outputViewJsonButton = document.getElementById('outputViewJson');
const testDataCopyButton = document.getElementById('testDataCopy');
const testDataClearButton = document.getElementById('testDataClear');
const outputCopyJsonButton = document.getElementById('outputCopyJson');
let testDataMeasure = null;
let outputViewMode = 'table';
let lastResponseData = null;

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
        renderTestDataHighlights(data, {});
        return `<div class="bg-red-50 border-l-4 border-red-500 p-4 rounded">
            <strong class="text-red-800">Error:</strong><br>
            <span class="text-red-700">${escapeHtml(data.error)}</span>
        </div>`;
    }
    
    if (!data.matches || data.matches.length === 0) {
        renderTestDataHighlights(data, {});
        return `<div class="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded">
            <strong class="text-yellow-800">No Match:</strong><br>
            <span class="text-yellow-700">${escapeHtml(data.error || 'Pattern did not match the test data')}</span>
            ${data.total ? `<br><br><span class="text-yellow-600">Total lines: ${data.total}, Matched: ${data.matched}</span>` : ''}
        </div>`;
    }
    
    let html = '';
    
    // Color palette for field highlighting
    const fieldColors = [
        { bg: 'bg-blue-100', text: 'text-blue-900', border: 'border-blue-300' },
        { bg: 'bg-green-100', text: 'text-green-900', border: 'border-green-300' },
        { bg: 'bg-purple-100', text: 'text-purple-900', border: 'border-purple-300' },
        { bg: 'bg-yellow-100', text: 'text-yellow-900', border: 'border-yellow-300' },
        { bg: 'bg-red-100', text: 'text-red-900', border: 'border-red-300' },
        { bg: 'bg-orange-100', text: 'text-orange-900', border: 'border-orange-300' },
        { bg: 'bg-teal-100', text: 'text-teal-900', border: 'border-teal-300' },
        { bg: 'bg-cyan-100', text: 'text-cyan-900', border: 'border-cyan-300' },
        { bg: 'bg-lime-100', text: 'text-lime-900', border: 'border-lime-300' },
        { bg: 'bg-emerald-100', text: 'text-emerald-900', border: 'border-emerald-300' },
        { bg: 'bg-fuchsia-100', text: 'text-fuchsia-900', border: 'border-fuchsia-300' },
        { bg: 'bg-violet-100', text: 'text-violet-900', border: 'border-violet-300' },
        { bg: 'bg-rose-100', text: 'text-rose-900', border: 'border-rose-300' },
        { bg: 'bg-sky-100', text: 'text-sky-900', border: 'border-sky-300' },
    ];
    
    const matches = data.matches || [];
    const fieldTypes = data.fieldTypes || {};
    const patternFieldOrder = Array.isArray(data.fieldOrder) ? data.fieldOrder : [];
    
    // Get all unique field names across all matches
    const allFields = new Set();
    matches.forEach(match => {
        const fields = match.fields || match;
        Object.keys(fields).forEach(key => allFields.add(key));
    });
    
    const orderedFields = buildFieldOrder(patternFieldOrder, allFields);

    // Assign colors to fields
    const fieldColorMap = {};
    orderedFields.forEach((field, index) => {
        fieldColorMap[field] = fieldColors[index % fieldColors.length];
    });
    
    renderTestDataHighlights(data, fieldColorMap, orderedFields);
    if (outputViewMode === 'json') {
        return html + renderJsonOutput(matches, orderedFields);
    }
    
    // Show results for each matched line
    matches.forEach((match, index) => {
        const fields = match.fields || match;
        
        html += `<div class="mb-5 bg-white rounded-lg overflow-hidden shadow-sm">`;
        html += `<div class="bg-indigo-600 text-white px-4 py-2 font-semibold text-sm">Match ${index + 1}</div>`;
        
        // Field table
        html += '<table class="w-full">';
        html += '<thead><tr class="bg-gray-100"><th class="px-3 py-2 text-left text-xs font-semibold text-gray-700">Field</th><th class="px-3 py-2 text-left text-xs font-semibold text-gray-700">Value</th><th class="px-3 py-2 text-left text-xs font-semibold text-gray-700">Type</th></tr></thead>';
        html += '<tbody>';
        
        const orderedEntries = buildOrderedEntries(fields, orderedFields);
        for (const [key, value] of orderedEntries) {
            const type = resolveFieldType(key, value, fieldTypes);
            const isNull = value === null;
            const displayValue = isNull ? '<em class="text-gray-400">null</em>' : escapeHtml(String(value));
            const colors = fieldColorMap[key] || { bg: 'bg-gray-100', text: 'text-gray-900', border: 'border-gray-300' };
            const valueTag = isNull
                ? displayValue
                : `<span class="inline-block px-2 py-1 rounded text-xs font-semibold ${colors.bg} ${colors.text} border ${colors.border} break-all">${displayValue}</span>`;
            
            html += `<tr class="border-b border-gray-200 hover:bg-gray-50">
                <td class="px-3 py-2">
                    <span class="inline-block px-2 py-1 rounded font-semibold text-xs ${colors.bg} ${colors.text} border ${colors.border}">
                        ${escapeHtml(key)}
                    </span>
                </td>
                <td class="px-3 py-2 text-gray-800 break-all">${valueTag}</td>
                <td class="px-3 py-2 text-gray-500 italic text-xs">${escapeHtml(type)}</td>
            </tr>`;
        }
        
        html += '</tbody></table></div>';
    });
    
    return html;
}

function highlightMatchedLine(line, match, fieldColorMap, options = {}) {
    if (!line) return '';
    
    // Create an array of segments to highlight
    const segments = [];
    const fieldOrder = Array.isArray(options.fieldOrder) ? options.fieldOrder : [];
    const orderedFields = buildOrderedFields(match, fieldOrder);
    
    // For each field in the match, try to find it in the original line
    let cursor = 0;
    for (const field of orderedFields) {
        const value = match[field];
        if (value === null || value === '') continue;
        
        const valueStr = String(value);
        let startIndex = line.indexOf(valueStr, cursor);
        
        if (startIndex === -1) {
            startIndex = line.indexOf(valueStr);
        }

        if (startIndex !== -1) {
            let endIndex = startIndex + valueStr.length;
            if (segments.length > 0 && startIndex < segments[segments.length - 1].end) {
                const nextIndex = line.indexOf(valueStr, segments[segments.length - 1].end);
                if (nextIndex !== -1) {
                    startIndex = nextIndex;
                    endIndex = nextIndex + valueStr.length;
                } else {
                    continue;
                }
            }

            segments.push({
                start: startIndex,
                end: endIndex,
                field: field,
                value: valueStr
            });

            cursor = endIndex;
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
        const fallbackText = options.hideText ? 'text-transparent' : 'text-gray-900';
        const colors = fieldColorMap[seg.field] || { bg: 'bg-gray-100', text: fallbackText, border: 'border-gray-300' };
        const textClass = options.hideText ? 'text-transparent' : colors.text;
        const displayClass = options.compact ? 'inline' : 'inline-block';
        const paddingClass = options.compact ? '' : 'px-1';
        const borderClass = options.compact ? '' : `border ${colors.border}`;
        result += `<span class="${displayClass} ${paddingClass} rounded ${colors.bg} ${textClass} ${borderClass}" title="${escapeHtml(seg.field)}">${escapeHtml(seg.value)}</span>`;
        
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

function renderJsonOutput(matches, orderedFields) {
    const orderedObjects = matches.map(match => {
        const fields = match.fields || match;
        const orderedEntries = buildOrderedEntries(fields, orderedFields);
        const obj = {};
        orderedEntries.forEach(([key, value]) => {
            obj[key] = value;
        });
        return obj;
    });

    const jsonString = JSON.stringify(orderedObjects, null, 2);
    return `<pre class="whitespace-pre-wrap break-words text-xs text-gray-800">${escapeHtml(jsonString)}</pre>`;
}

function getJsonOutputString(data) {
    if (!data || !data.matches || data.matches.length === 0) {
        return '';
    }

    const matches = data.matches || [];
    const allFields = new Set();
    matches.forEach(match => {
        const fields = match.fields || match;
        Object.keys(fields).forEach(key => allFields.add(key));
    });
    const orderedFields = buildFieldOrder(Array.isArray(data.fieldOrder) ? data.fieldOrder : [], allFields);

    const orderedObjects = matches.map(match => {
        const fields = match.fields || match;
        const orderedEntries = buildOrderedEntries(fields, orderedFields);
        const obj = {};
        orderedEntries.forEach(([key, value]) => {
            obj[key] = value;
        });
        return obj;
    });

    return JSON.stringify(orderedObjects, null, 2);
}

function buildFieldOrder(patternFieldOrder, fieldSet) {
    if (!patternFieldOrder || patternFieldOrder.length === 0) {
        return Array.from(fieldSet);
    }

    const ordered = [];
    const used = new Set();
    patternFieldOrder.forEach(field => {
        if (fieldSet.has(field)) {
            ordered.push(field);
            used.add(field);
        }
    });

    fieldSet.forEach(field => {
        if (!used.has(field)) {
            ordered.push(field);
        }
    });

    return ordered;
}

function buildOrderedEntries(fields, orderedFields) {
    const entries = [];
    const used = new Set();

    orderedFields.forEach(field => {
        if (Object.prototype.hasOwnProperty.call(fields, field)) {
            entries.push([field, fields[field]]);
            used.add(field);
        }
    });

    Object.entries(fields).forEach(([key, value]) => {
        if (!used.has(key)) {
            entries.push([key, value]);
        }
    });

    return entries;
}

function buildOrderedFields(fields, fieldOrder) {
    if (!fieldOrder || fieldOrder.length === 0) {
        return Object.keys(fields);
    }

    const ordered = [];
    const used = new Set();

    fieldOrder.forEach(field => {
        if (Object.prototype.hasOwnProperty.call(fields, field)) {
            ordered.push(field);
            used.add(field);
        }
    });

    Object.keys(fields).forEach(field => {
        if (!used.has(field)) {
            ordered.push(field);
        }
    });

    return ordered;
}

function resolveFieldType(field, value, fieldTypes) {
    if (value === null) {
        return 'null';
    }

    if (fieldTypes && fieldTypes[field]) {
        return fieldTypes[field];
    }

    return typeof value;
}

function renderTestDataHighlights(data, fieldColorMap, fieldOrder = []) {
    if (!testDataHighlightContent) {
        return;
    }

    const colorMap = fieldColorMap || {};
    const lines = testDataInput.value.split('\n');
    updateTestDataLineNumbers(lines);
    const matchByLine = new Map();
    const matches = data && Array.isArray(data.matches) ? data.matches : [];
    const hasLineIndexes = matches.some(match => Number.isInteger(match.lineIndex));

    if (hasLineIndexes) {
        matches.forEach(match => {
            if (Number.isInteger(match.lineIndex)) {
                matchByLine.set(match.lineIndex, match);
            }
        });
    } else {
        let matchIndex = 0;
        lines.forEach((line, index) => {
            if (line.trim() === '') {
                return;
            }

            const match = matches[matchIndex];
            if (match) {
                matchByLine.set(index, match);
                matchIndex += 1;
            }
        });
    }

    const htmlLines = lines.map((line, index) => {
        const match = matchByLine.get(index);
        if (match && match.fields) {
            return highlightMatchedLine(line, match.fields, colorMap, { hideText: true, compact: true, fieldOrder });
        }
        if (match && !match.fields) {
            return highlightMatchedLine(line, match, colorMap, { hideText: true, compact: true, fieldOrder });
        }

        return escapeHtml(line);
    });

    testDataHighlightContent.innerHTML = htmlLines.join('\n');
    syncTestDataHighlightScroll();
}

function syncTestDataHighlightScroll() {
    if (!testDataHighlights) {
        return;
    }

    testDataHighlights.scrollTop = testDataInput.scrollTop;
    testDataHighlights.scrollLeft = testDataInput.scrollLeft;
}

function ensureTestDataMeasure() {
    if (testDataMeasure) {
        return testDataMeasure;
    }

    const measure = document.createElement('div');
    measure.style.position = 'absolute';
    measure.style.visibility = 'hidden';
    measure.style.top = '-9999px';
    measure.style.left = '-9999px';
    measure.style.whiteSpace = 'pre-wrap';
    measure.style.wordBreak = 'break-word';
    measure.style.overflowWrap = 'break-word';
    measure.style.padding = '0';
    measure.style.margin = '0';
    measure.style.border = '0';
    measure.style.boxSizing = 'content-box';
    document.body.appendChild(measure);
    testDataMeasure = measure;
    return measure;
}

function updateTestDataLineNumbers(lines) {
    if (!testDataLineNumberContent) {
        return;
    }

    const measure = ensureTestDataMeasure();
    const style = getComputedStyle(testDataInput);
    const lineHeight = parseFloat(style.lineHeight) || 0;
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const paddingRight = parseFloat(style.paddingRight) || 0;
    const contentWidth = Math.max(0, testDataInput.clientWidth - paddingLeft - paddingRight);

    measure.style.font = style.font;
    measure.style.letterSpacing = style.letterSpacing;
    measure.style.lineHeight = style.lineHeight;
    measure.style.width = `${contentWidth}px`;

    const numbers = [];
    lines.forEach((line, index) => {
        const text = line === '' ? ' ' : line;
        measure.textContent = text;
        const height = measure.getBoundingClientRect().height;
        const visualLines = lineHeight > 0 ? Math.max(1, Math.ceil(height / lineHeight)) : 1;
        numbers.push(String(index + 1));
        for (let i = 1; i < visualLines; i += 1) {
            numbers.push('');
        }
    });

    testDataLineNumberContent.textContent = numbers.join('\n');
}

function testPattern() {
    const pattern = patternInput.value.trim();
    const testData = testDataInput.value;
    const testDataTrimmed = testData.trim();
    
    if (!pattern || !testDataTrimmed) {
        lastResponseData = null;
        outputDiv.innerHTML = '<div class="text-gray-500 text-center py-10 italic">Enter both a pattern and test data to see results...</div>';
        renderTestDataHighlights(null, {});
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
        lastResponseData = data;
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
        lastResponseData = null;
        outputDiv.innerHTML = `<div class="bg-red-50 border-l-4 border-red-500 p-4 rounded">
            <strong class="text-red-800">Request Error:</strong><br>
            <span class="text-red-700">${escapeHtml(error.message)}</span>
        </div>`;
        renderTestDataHighlights(null, {});
        updateStatus('Error', 'error');
    });
}

function handleInput() {
    clearTimeout(debounceTimer);
    updateTestDataLineNumbers(testDataInput.value.split('\n'));
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

function setOutputViewMode(mode) {
    outputViewMode = mode;
    updateOutputViewButtons();
    if (lastResponseData) {
        outputDiv.innerHTML = formatOutput(lastResponseData);
    }
}

function updateOutputViewButtons() {
    if (!outputViewTableButton || !outputViewJsonButton) {
        return;
    }

    if (outputViewMode === 'table') {
        outputViewTableButton.className = 'px-3 py-1 text-xs font-semibold text-gray-700 bg-gray-100';
        outputViewJsonButton.className = 'px-3 py-1 text-xs font-semibold text-gray-600 hover:text-gray-800';
    } else {
        outputViewTableButton.className = 'px-3 py-1 text-xs font-semibold text-gray-600 hover:text-gray-800';
        outputViewJsonButton.className = 'px-3 py-1 text-xs font-semibold text-gray-700 bg-gray-100';
    }
}

// Add event listeners
patternInput.addEventListener('input', handlePatternInput);
patternInput.addEventListener('keydown', handlePatternKeyDown);
testDataInput.addEventListener('input', handleInput);
testDataInput.addEventListener('scroll', syncTestDataHighlightScroll);
if (outputViewTableButton && outputViewJsonButton) {
    outputViewTableButton.addEventListener('click', () => setOutputViewMode('table'));
    outputViewJsonButton.addEventListener('click', () => setOutputViewMode('json'));
}
if (testDataCopyButton) {
    testDataCopyButton.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(testDataInput.value);
        } catch (err) {
            console.error('Failed to copy test data:', err);
        }
    });
}
if (testDataClearButton) {
    testDataClearButton.addEventListener('click', () => {
        testDataInput.value = '';
        handleInput();
    });
}
if (outputCopyJsonButton) {
    outputCopyJsonButton.addEventListener('click', async () => {
        const jsonString = getJsonOutputString(lastResponseData);
        if (!jsonString) {
            return;
        }

        try {
            await navigator.clipboard.writeText(jsonString);
        } catch (err) {
            console.error('Failed to copy JSON output:', err);
        }
    });
}
window.addEventListener('resize', () => {
    updateTestDataLineNumbers(testDataInput.value.split('\n'));
});

// Close autocomplete when clicking outside
document.addEventListener('click', (e) => {
    if (e.target !== patternInput && !autocompleteList?.contains(e.target)) {
        hideAutocomplete();
    }
});

// Load example on page load
window.addEventListener('DOMContentLoaded', () => {
    loadPatternNames();
    updateOutputViewButtons();
    patternInput.value = '%{IPORHOST:remote_addr} %{DATA:remote_host} %{DATA:remote_user} \\[%{DATA:timestamp}\\] "%{WORD:http_method} %{DATA:request} %{DATA:http_version}" %{INT:status} %{INT:body_bytes_sent} "%{DATA:http_referer}" "%{DATA:user_agent}"';
    testDataInput.value = `173.249.11.249 - - [26/Jan/2026:10:08:49 +0800] "GET /zend/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php HTTP/1.1" 401 633 "-" "libretail-http"
173.249.11.249 - - [26/Jan/2026:10:08:49 +0800] "GET /ws/ec/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php HTTP/1.1" 401 633 "-" "libretail-http"
173.249.11.249 - - [26/Jan/2026:10:08:50 +0800] "GET /V2/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php HTTP/1.1" 401 633 "-" "libretail-http"`;
    testPattern();
});
