# Contributing to PRIVISEE-X

Thank you for your interest in contributing to PRIVISEE-X! This document provides guidelines for contributing to the project.

## Code of Conduct

Be respectful, inclusive, and constructive. We're all here to improve privacy for everyone.

## Getting Started

### Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/privisee-x.git
   cd privisee-x
   ```

2. **Load the extension in Chrome**
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `privisee-x/src/` directory

3. **Install Python dependencies** (for ML training, optional)
   ```bash
   cd ml
   pip install -r requirements.txt
   ```

### Project Structure

```
privisee-x/
├── src/                    # Extension source code
│   ├── background.js       # Service worker
│   ├── content.js          # Content script
│   ├── modules/            # Core modules
│   ├── ui/                 # UI components (dashboard, popup)
│   └── data/               # Tracker blocklists
├── ml/                     # ML training scripts
├── models/                 # TensorFlow.js models
├── docs/                   # Documentation
└── tests/                  # Test suite
```

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/yourusername/privisee-x/issues)
2. If not, create a new issue with:
   - Clear, descriptive title
   - Steps to reproduce
   - Expected vs actual behavior
   - Browser version and OS
   - Screenshots if applicable

### Suggesting Enhancements

1. Open an issue with the `enhancement` label
2. Describe the feature and its use case
3. Explain why this would be useful to users
4. Consider implementation complexity

### Pull Requests

1. **Fork the repository**

2. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes**
   - Follow the code style guidelines (below)
   - Add tests for new features
   - Update documentation as needed

4. **Test your changes**
   - Load the extension and verify functionality
   - Run any applicable tests
   - Check for console errors

5. **Commit with clear messages**
   ```bash
   git commit -m "feat: add dark pattern detection for hidden checkboxes"
   ```

   Commit message format:
   - `feat:` New feature
   - `fix:` Bug fix
   - `docs:` Documentation changes
   - `style:` Code style changes (no functional changes)
   - `refactor:` Code refactoring
   - `perf:` Performance improvements
   - `test:` Adding or updating tests

6. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```

7. **Create a Pull Request**
   - Use a clear, descriptive title
   - Reference relevant issues
   - Describe what changed and why
   - Include screenshots/GIFs for UI changes

## Code Style Guidelines

### JavaScript

- **Use ES6+ features**: `const`/`let`, arrow functions, classes, template literals
- **Naming conventions**:
  - `camelCase` for variables and functions
  - `PascalCase` for classes
  - `UPPER_SNAKE_CASE` for constants
- **Comments**: Use JSDoc for functions and classes
  ```javascript
  /**
   * Calculate risk score for a site
   * @param {Object} siteData - Site data object
   * @returns {number} Risk score (0-100)
   */
  calculateRisk(siteData) {
    // Implementation
  }
  ```

- **Error handling**: Always handle errors gracefully
  ```javascript
  try {
    await storage.saveSite(data);
  } catch (error) {
    console.error('[Module] Error:', error);
    return { success: false, error: error.message };
  }
  ```

### HTML/CSS

- **Semantic HTML**: Use appropriate tags (`<section>`, `<article>`, etc.)
- **CSS classes**: Use descriptive, hyphenated names (`risk-gauge-card`)
- **Responsive design**: Test on different screen sizes
- **Accessibility**: Use ARIA labels where appropriate

### Module Design

- **Single Responsibility**: Each module should have one clear purpose
- **Independence**: Modules should minimize dependencies
- **Testability**: Design for easy unit testing
- **Documentation**: Include module-level documentation

## Testing

### Manual Testing Checklist

- [ ] Extension loads without errors
- [ ] Popup displays correct data for current site
- [ ] Dashboard renders all sections
- [ ] Settings save and persist
- [ ] Fingerprinting detection works
- [ ] Graph visualization renders
- [ ] Data export/import works
- [ ] No console errors
- [ ] Performance acceptable (CPU \u003c3%, Memory \u003c100MB)

### Adding Tests

Tests should be added for:
- New detection methods
- Risk calculation changes
- Storage operations
- Graph algorithms
- Any bug fixes

## Documentation

### Required Documentation Updates

- **README.md**: For user-facing features
- **ARCHITECTURE.md**: For architectural changes
- **API.md**: For new APIs or message types
- **Inline comments**: For complex logic

### Documentation Style

- Use clear, concise language
- Include code examples
- Add diagrams for complex flows (Mermaid) 
- Keep it up-to-date with code changes

## ML Model Contributions

### Training New Models

1. Document the dataset used
2. Explain feature engineering
3. Include evaluation metrics
4. Provide reproducibility steps
5. Submit both Python and TensorFlow.js versions

### Model Requirements

- Must run client-side (TensorFlow.js compatible)
- Size \u003c5MB (compressed)
- Inference \u003c10ms per classification
- Accuracy \u003e85% on test set

## Tracker Blocklist Contributions

### Adding Trackers

Edit `src/data/tracker_blocklist.json`:

```json
{
  "domain": "new-tracker.com",
  "category": "advertising",
  "source": "manual",
  "verified": true
}
```

### Verification Required

- Domain must be actively tracking
- Category must be accurate
- Include source/reference
- Test that detection works

## Performance Guidelines

### Targets

- CPU usage \u003c3% (active), \u003c1% (idle)
- Memory usage \u003c100MB
- Request processing \u003c5ms
- Dashboard load \u003c500ms

### Optimization Techniques

- Use IndexedDB indexes for queries
- Cache frequently accessed data
- Batch database operations
- Throttle high-frequency events
- Lazy load UI components

## Privacy Principles

All contributions must respect these principles:

1. **Zero external API calls** - All processing must be local
2. **No telemetry** - Never collect user data
3. **Minimal permissions** - Only request necessary permissions
4. **Transparent operation** - User should understand what the extension does
5. **Data ownership** - User controls their data (export/delete)

## Review Process

1. **Automated checks**: Code must pass linting (if implemented)
2. **Manual review**: Maintainer reviews code for quality and security
3. **Testing**: Verify functionality works as described
4. **Documentation**: Ensure docs are updated
5. **Merge**: PR merged after approval

## Recognition

Contributors will be:
- Listed in README acknowledgments
- Mentioned in release notes (for significant contributions)
- Added to CONTRIBUTORS file

## Questions?

- Open a [Discussion](https://github.com/yourusername/privisee-x/discussions)
- Tag issues with `question` label
- Reach out to maintainers

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for helping make the web more private! 🛡️
