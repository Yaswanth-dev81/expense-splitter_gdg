/**
 * EXPENSE SPLITTER - WIZARD-BASED NAVIGATION WITH DARK MODE
 * Enhanced with step-by-step flow and feedback collection
 */
// Decimal Arithmetic Module
const Decimal = {
    fromNumber(num) {
        return (Math.round(num * 100) / 100).toFixed(2);
    },

    toCents(decimalStr) {
        const str = String(decimalStr).trim();
        if (!str || isNaN(str)) return 0;
        return Math.round(parseFloat(str) * 100);
    },

    fromCents(cents) {
        return (cents / 100).toFixed(2);
    },

    add(a, b) {
        const centsA = this.toCents(a);
        const centsB = this.toCents(b);
        return this.fromCents(centsA + centsB);
    },

    subtract(a, b) {
        const centsA = this.toCents(a);
        const centsB = this.toCents(b);
        return this.fromCents(centsA - centsB);
    },

    divideEqually(amount, parts) {
        if (parts <= 0) return [];
        
        const totalCents = this.toCents(amount);
        const baseCents = Math.floor(totalCents / parts);
        const remainder = totalCents - (baseCents * parts);
        
        const shares = new Array(parts).fill(baseCents);
        
        for (let i = 0; i < remainder; i++) {
            shares[i]++;
        }
        
        return shares.map(cents => this.fromCents(cents));
    },

    compare(a, b) {
        const centsA = this.toCents(a);
        const centsB = this.toCents(b);
        return centsA - centsB;
    },

    isZero(amount) {
        return this.toCents(amount) === 0;
    },

    format(amount, currency = '₹') {
        const num = parseFloat(amount);
        return `${currency}${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
};

// State Management Module

const State = {
    members: [],
    expenses: [],
    currentStep: 1,
    feedback: null,

    init() {
        try {
            const stored = localStorage.getItem('expenseSplitterState');
            if (stored) {
                const parsed = JSON.parse(stored);
                this.members = Array.isArray(parsed.members) ? parsed.members : [];
                this.expenses = Array.isArray(parsed.expenses) ? parsed.expenses : [];
                this.currentStep = parsed.currentStep || 1;
                this.feedback = parsed.feedback || null;
            }
        } catch (error) {
            console.error('Failed to load state:', error);
            this.members = [];
            this.expenses = [];
            this.currentStep = 1;
            this.feedback = null;
        }
        this.persist();
    },

    persist() {
        try {
            localStorage.setItem('expenseSplitterState', JSON.stringify({
                members: this.members,
                expenses: this.expenses,
                currentStep: this.currentStep,
                feedback: this.feedback
            }));
        } catch (error) {
            console.error('Failed to persist state:', error);
        }
    },

    setCurrentStep(step) {
        this.currentStep = step;
        this.persist();
    },

    addMember(name) {
        const trimmedName = name.trim();
        if (!trimmedName) return null;
        
        if (this.members.some(m => m.name.toLowerCase() === trimmedName.toLowerCase())) {
            return null;
        }

        const member = {
            id: this.generateId(),
            name: trimmedName,
            createdAt: Date.now()
        };

        this.members.push(member);
        this.persist();
        return member;
    },

    removeMember(memberId) {
        const isInvolved = this.expenses.some(
            expense => expense.paidBy === memberId || expense.splitBetween.includes(memberId)
        );

        if (isInvolved) {
            return false;
        }

        this.members = this.members.filter(m => m.id !== memberId);
        this.persist();
        return true;
    },

    addExpense(title, amount, paidBy, splitBetween) {
        if (!title.trim() || !amount || !paidBy || !splitBetween.length) {
            return null;
        }

        const cents = Decimal.toCents(amount);
        if (cents <= 0) {
            return null;
        }

        if (!this.members.find(m => m.id === paidBy)) {
            return null;
        }

        for (const memberId of splitBetween) {
            if (!this.members.find(m => m.id === memberId)) {
                return null;
            }
        }

        const expense = {
            id: this.generateId(),
            title: title.trim(),
            amount: Decimal.fromCents(cents),
            paidBy,
            splitBetween: [...splitBetween],
            createdAt: Date.now()
        };

        this.expenses.push(expense);
        this.persist();
        return expense;
    },

    removeExpense(expenseId) {
        this.expenses = this.expenses.filter(e => e.id !== expenseId);
        this.persist();
    },

    saveFeedback(rating, text) {
        this.feedback = {
            rating,
            text: text.trim(),
            timestamp: Date.now()
        };
        this.persist();
    },

    clearAll() {
        this.members = [];
        this.expenses = [];
        this.currentStep = 1;
        this.feedback = null;
        this.persist();
    },

    generateId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    },

    getMember(memberId) {
        return this.members.find(m => m.id === memberId);
    }
};

// Calculation Engine

const Calculator = {
    calculateExpenseShares(expense) {
        const shares = {};
        const splitCount = expense.splitBetween.length;
        
        if (splitCount === 0) return shares;

        const amounts = Decimal.divideEqually(expense.amount, splitCount);
        
        expense.splitBetween.forEach((memberId, index) => {
            shares[memberId] = amounts[index];
        });

        return shares;
    },

    calculateBalances(members, expenses) {
        const balances = members.map(member => ({
            memberId: member.id,
            name: member.name,
            totalPaid: '0.00',
            totalOwed: '0.00',
            netBalance: '0.00'
        }));

        const balanceMap = {};
        members.forEach(member => {
            balanceMap[member.id] = {
                paidCents: 0,
                owedCents: 0
            };
        });

        expenses.forEach(expense => {
            balanceMap[expense.paidBy].paidCents += Decimal.toCents(expense.amount);

            const shares = this.calculateExpenseShares(expense);
            Object.entries(shares).forEach(([memberId, shareAmount]) => {
                balanceMap[memberId].owedCents += Decimal.toCents(shareAmount);
            });
        });

        balances.forEach(balance => {
            const data = balanceMap[balance.memberId];
            balance.totalPaid = Decimal.fromCents(data.paidCents);
            balance.totalOwed = Decimal.fromCents(data.owedCents);
            balance.netBalance = Decimal.fromCents(data.paidCents - data.owedCents);
        });

        return balances;
    },

    calculateSettlements(balances) {
        const settlements = [];

        const creditors = balances
            .filter(b => Decimal.compare(b.netBalance, '0.00') > 0)
            .map(b => ({
                memberId: b.memberId,
                name: b.name,
                amountCents: Decimal.toCents(b.netBalance)
            }))
            .sort((a, b) => b.amountCents - a.amountCents);

        const debtors = balances
            .filter(b => Decimal.compare(b.netBalance, '0.00') < 0)
            .map(b => ({
                memberId: b.memberId,
                name: b.name,
                amountCents: Math.abs(Decimal.toCents(b.netBalance))
            }))
            .sort((a, b) => b.amountCents - a.amountCents);

        let i = 0, j = 0;
        
        while (i < creditors.length && j < debtors.length) {
            const creditor = creditors[i];
            const debtor = debtors[j];

            const settlementCents = Math.min(creditor.amountCents, debtor.amountCents);
            
            if (settlementCents > 0) {
                settlements.push({
                    from: debtor.name,
                    fromId: debtor.memberId,
                    to: creditor.name,
                    toId: creditor.memberId,
                    amount: Decimal.fromCents(settlementCents)
                });
            }

            creditor.amountCents -= settlementCents;
            debtor.amountCents -= settlementCents;

            if (creditor.amountCents === 0) i++;
            if (debtor.amountCents === 0) j++;
        }

        return settlements;
    }
};

// Navigation module

const Navigation = {
    goToStep(stepNumber) {
        // Hide all steps
        document.querySelectorAll('.step-container').forEach(step => {
            step.classList.remove('active');
        });

        // Show target step
        const targetStep = document.getElementById(`step-${stepNumber}`);
        if (targetStep) {
            targetStep.classList.add('active');
            State.setCurrentStep(stepNumber);
            this.updateProgressBar(stepNumber);
            
            // Scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });

            // Render content for the step
            if (stepNumber === 2) {
                UI.renderExpenses();
                UI.renderBalances();
            } else if (stepNumber === 3) {
                UI.renderSettlements();
            }
        }
    },

    updateProgressBar(currentStep) {
        document.querySelectorAll('.progress-step').forEach((step, index) => {
            const stepNumber = index + 1;
            
            step.classList.remove('active', 'completed');
            
            if (stepNumber === currentStep) {
                step.classList.add('active');
            } else if (stepNumber < currentStep) {
                step.classList.add('completed');
            }
        });
    },

    canProceedFromStep1() {
        return State.members.length >= 2;
    }
};

// Theme Module

const Theme = {
    init() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        this.setTheme(savedTheme);
    },

    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        
        const icon = document.querySelector('.theme-icon');
        icon.textContent = theme === 'dark' ? '☀️' : '🌙';
    },

    toggle() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        this.setTheme(newTheme);
    }
};

// UI Rendering Module

const UI = {
    renderAll() {
        this.renderMembers();
        this.renderMemberSelectors();
        this.updateNavigationButtons();
    },

    updateNavigationButtons() {
        const nextToExpensesBtn = document.getElementById('next-to-expenses');
        if (Navigation.canProceedFromStep1()) {
            nextToExpensesBtn.disabled = false;
        } else {
            nextToExpensesBtn.disabled = true;
        }
    },

    renderMembers() {
        const container = document.getElementById('members-list');
        
        if (State.members.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">👥</div>
                    <p>No members yet. Add at least 2 members to continue.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = State.members
            .map(member => `
                <div class="member-item">
                    <span class="member-name">${this.escapeHtml(member.name)}</span>
                    <button 
                        class="btn-danger" 
                        onclick="App.removeMember('${member.id}')"
                        title="Remove member"
                    >Remove</button>
                </div>
            `)
            .join('');
    },

    renderMemberSelectors() {
        const paidBySelect = document.getElementById('expense-paid-by');
        const splitBetweenContainer = document.getElementById('split-between-checkboxes');

        if (State.members.length === 0) {
            paidBySelect.innerHTML = '<option value="">No members available</option>';
            splitBetweenContainer.innerHTML = '<p style="color: var(--text-muted); font-size: 0.875rem;">Add members first</p>';
            return;
        }

        paidBySelect.innerHTML = `
            <option value="">Select member</option>
            ${State.members.map(m => `
                <option value="${m.id}">${this.escapeHtml(m.name)}</option>
            `).join('')}
        `;

        splitBetweenContainer.innerHTML = State.members
            .map(m => `
                <div class="checkbox-item">
                    <input 
                        type="checkbox" 
                        id="split-${m.id}" 
                        value="${m.id}"
                        name="splitBetween"
                    >
                    <label for="split-${m.id}">${this.escapeHtml(m.name)}</label>
                </div>
            `)
            .join('');
    },

    renderExpenses() {
        const container = document.getElementById('expenses-list');

        if (State.expenses.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">💰</div>
                    <p>No expenses recorded yet.</p>
                </div>
            `;
            return;
        }

        const expensesHtml = State.expenses
            .sort((a, b) => b.createdAt - a.createdAt)
            .map(expense => {
                const payer = State.getMember(expense.paidBy);
                const shares = Calculator.calculateExpenseShares(expense);
                const splitMembers = expense.splitBetween
                    .map(id => State.getMember(id)?.name)
                    .filter(Boolean)
                    .join(', ');

                return `
                    <div class="expense-item">
                        <div class="expense-header">
                            <div>
                                <div class="expense-title">${this.escapeHtml(expense.title)}</div>
                                <div class="expense-details">
                                    <div class="expense-detail">
                                        <strong>Paid by:</strong> ${this.escapeHtml(payer?.name || 'Unknown')}
                                    </div>
                                    <div class="expense-detail">
                                        <strong>Split between:</strong> ${this.escapeHtml(splitMembers)}
                                    </div>
                                </div>
                            </div>
                            <div style="text-align: right;">
                                <div class="expense-amount">${Decimal.format(expense.amount)}</div>
                                <button 
                                    class="btn-danger mt-1" 
                                    onclick="App.removeExpense('${expense.id}')"
                                >Delete</button>
                            </div>
                        </div>
                        
                        <div class="expense-splits">
                            <div class="expense-splits-title">Individual Shares</div>
                            ${Object.entries(shares).map(([memberId, amount]) => {
                                const member = State.getMember(memberId);
                                return `
                                    <div class="split-item">
                                        <span>${this.escapeHtml(member?.name || 'Unknown')}</span>
                                        <span>${Decimal.format(amount)}</span>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            })
            .join('');

        container.innerHTML = expensesHtml;
    },

    renderBalances() {
        const container = document.getElementById('balances-list');

        if (State.members.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📊</div>
                    <p>Add members to see balances.</p>
                </div>
            `;
            return;
        }

        const balances = Calculator.calculateBalances(State.members, State.expenses);

        const balancesHtml = balances
            .map(balance => {
                const netCents = Decimal.toCents(balance.netBalance);
                const status = netCents > 0 ? 'positive' : netCents < 0 ? 'negative' : 'neutral';

                return `
                    <div class="balance-item ${status}">
                        <div class="balance-header">
                            <div class="balance-name">${this.escapeHtml(balance.name)}</div>
                            <div class="balance-net ${status}">
                                ${Decimal.format(balance.netBalance)}
                            </div>
                        </div>
                        <div class="balance-details">
                            <div class="balance-detail-item">
                                <div class="balance-detail-label">Total Paid</div>
                                <div class="balance-detail-value">${Decimal.format(balance.totalPaid)}</div>
                            </div>
                            <div class="balance-detail-item">
                                <div class="balance-detail-label">Total Owed</div>
                                <div class="balance-detail-value">${Decimal.format(balance.totalOwed)}</div>
                            </div>
                        </div>
                    </div>
                `;
            })
            .join('');

        container.innerHTML = balancesHtml;
    },

    renderSettlements() {
        const statsContainer = document.getElementById('settlement-stats');
        const container = document.getElementById('settlement-list');

        if (State.members.length === 0 || State.expenses.length === 0) {
            statsContainer.innerHTML = '';
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">✅</div>
                    <p>Add expenses to see settlement instructions.</p>
                </div>
            `;
            return;
        }

        const balances = Calculator.calculateBalances(State.members, State.expenses);
        const settlements = Calculator.calculateSettlements(balances);

        // Calculate total
        const totalExpenses = State.expenses.reduce((sum, exp) => {
            return sum + Decimal.toCents(exp.amount);
        }, 0);

        // Render stats
        statsContainer.innerHTML = `
            <div class="stat-card">
                <div class="stat-label">Total Expenses</div>
                <div class="stat-value">${Decimal.format(Decimal.fromCents(totalExpenses))}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Transactions Needed</div>
                <div class="stat-value">${settlements.length}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Members</div>
                <div class="stat-value">${State.members.length}</div>
            </div>
        `;

        if (settlements.length === 0) {
            container.innerHTML = `
                <div class="settlement-empty">
                    <div style="font-size: 2rem; margin-bottom: 0.5rem;">✨</div>
                    <div>All settled! No payments needed.</div>
                </div>
            `;
            return;
        }

        const settlementsHtml = settlements
            .map(settlement => `
                <div class="settlement-item">
                    <div class="settlement-icon">💸</div>
                    <div class="settlement-text">
                        <strong>${this.escapeHtml(settlement.from)}</strong> pays 
                        <strong>${this.escapeHtml(settlement.to)}</strong>
                    </div>
                    <div class="settlement-amount">${Decimal.format(settlement.amount)}</div>
                </div>
            `)
            .join('');

        container.innerHTML = settlementsHtml;
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// Tab Management

const Tabs = {
    init() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabName = e.target.dataset.tab;
                this.switchTab(tabName);
            });
        });
    },

    switchTab(tabName) {
        // Update buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.tab === tabName) {
                btn.classList.add('active');
            }
        });

        // Update content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });

        const targetContent = document.getElementById(`${tabName}-tab`);
        if (targetContent) {
            targetContent.classList.add('active');
        }
    }
};

// Feedback Module

const Feedback = {
    selectedRating: 0,

    init() {
        const stars = document.querySelectorAll('.star');
        stars.forEach(star => {
            star.addEventListener('click', () => {
                const rating = parseInt(star.dataset.rating);
                this.setRating(rating);
            });

            star.addEventListener('mouseenter', () => {
                const rating = parseInt(star.dataset.rating);
                this.highlightStars(rating);
            });
        });

        document.querySelector('.rating-stars').addEventListener('mouseleave', () => {
            this.highlightStars(this.selectedRating);
        });

        // Character count
        const textarea = document.getElementById('feedback-text');
        const charCount = document.getElementById('char-count');
        textarea.addEventListener('input', () => {
            charCount.textContent = textarea.value.length;
        });
    },

    setRating(rating) {
        this.selectedRating = rating;
        document.getElementById('rating-value').value = rating;
        this.highlightStars(rating);
    },

    highlightStars(rating) {
        document.querySelectorAll('.star').forEach((star, index) => {
            if (index < rating) {
                star.classList.add('active');
            } else {
                star.classList.remove('active');
            }
        });
    },

    submit(rating, text) {
        State.saveFeedback(rating, text);
        
        // Show success message
        document.getElementById('feedback-form').classList.add('hidden');
        document.getElementById('feedback-success').classList.remove('hidden');
    }
};

// Application Controller

const App = {
    init() {
        State.init();
        Theme.init();
        Tabs.init();
        Feedback.init();
        this.bindEvents();
        UI.renderAll();
        Navigation.goToStep(State.currentStep);
    },

    bindEvents() {
        // Theme toggle
        document.getElementById('theme-toggle').addEventListener('click', () => {
            Theme.toggle();
        });

        // Add member
        document.getElementById('add-member-btn').addEventListener('click', () => {
            this.addMember();
        });

        document.getElementById('member-name-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addMember();
            }
        });

        // Navigation
        document.getElementById('next-to-expenses').addEventListener('click', () => {
            Navigation.goToStep(2);
        });

        document.getElementById('prev-to-members').addEventListener('click', () => {
            Navigation.goToStep(1);
        });

        document.getElementById('next-to-settlement').addEventListener('click', () => {
            Navigation.goToStep(3);
        });

        document.getElementById('prev-to-expenses').addEventListener('click', () => {
            Navigation.goToStep(2);
        });

        document.getElementById('next-to-feedback').addEventListener('click', () => {
            Navigation.goToStep(4);
        });

        document.getElementById('prev-to-settlement').addEventListener('click', () => {
            Navigation.goToStep(3);
        });

        // Add expense
        document.getElementById('expense-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addExpense();
        });

        // Feedback
        document.getElementById('feedback-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitFeedback();
        });

        // Restart
        document.getElementById('restart-btn').addEventListener('click', () => {
            if (confirm('Start a new session? Current data will be cleared.')) {
                State.clearAll();
                location.reload();
            }
        });

        // Clear all
        document.getElementById('clear-all-btn').addEventListener('click', () => {
            if (confirm('Are you sure you want to clear all data? This cannot be undone.')) {
                State.clearAll();
                UI.renderAll();
            }
        });

        // Amount input validation
        const amountInput = document.getElementById('expense-amount');
        amountInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^0-9.]/g, '');
            
            const parts = e.target.value.split('.');
            if (parts.length > 2) {
                e.target.value = parts[0] + '.' + parts.slice(1).join('');
            }
            
            if (parts[1] && parts[1].length > 2) {
                e.target.value = parts[0] + '.' + parts[1].substring(0, 2);
            }
        });
    },

    addMember() {
        const input = document.getElementById('member-name-input');
        const name = input.value.trim();

        if (!name) {
            alert('Please enter a member name');
            return;
        }

        const member = State.addMember(name);
        
        if (!member) {
            alert('Member with this name already exists');
            return;
        }

        input.value = '';
        UI.renderAll();
    },

    removeMember(memberId) {
        const member = State.getMember(memberId);
        
        if (!confirm(`Remove ${member.name}?`)) {
            return;
        }

        const removed = State.removeMember(memberId);
        
        if (!removed) {
            alert('Cannot remove member who is involved in expenses. Delete those expenses first.');
            return;
        }

        UI.renderAll();
    },

    addExpense() {
        const title = document.getElementById('expense-title').value.trim();
        const amount = document.getElementById('expense-amount').value.trim();
        const paidBy = document.getElementById('expense-paid-by').value;
        
        const splitBetweenCheckboxes = document.querySelectorAll('input[name="splitBetween"]:checked');
        const splitBetween = Array.from(splitBetweenCheckboxes).map(cb => cb.value);

        if (!title) {
            alert('Please enter expense description');
            return;
        }

        if (!amount || parseFloat(amount) <= 0) {
            alert('Please enter a valid amount greater than 0');
            return;
        }

        if (!paidBy) {
            alert('Please select who paid');
            return;
        }

        if (splitBetween.length === 0) {
            alert('Please select at least one person to split between');
            return;
        }

        const expense = State.addExpense(title, amount, paidBy, splitBetween);

        if (!expense) {
            alert('Failed to add expense. Please check your inputs.');
            return;
        }

        // Clear form
        document.getElementById('expense-form').reset();
        splitBetweenCheckboxes.forEach(cb => cb.checked = false);

        // Switch to expense history tab
        Tabs.switchTab('expense-history');
        UI.renderExpenses();
        UI.renderBalances();
    },

    removeExpense(expenseId) {
        if (!confirm('Delete this expense?')) {
            return;
        }

        State.removeExpense(expenseId);
        UI.renderExpenses();
        UI.renderBalances();
    },

    submitFeedback() {
        const rating = parseInt(document.getElementById('rating-value').value);
        const text = document.getElementById('feedback-text').value;

        if (!rating) {
            alert('Please select a rating');
            return;
        }

        Feedback.submit(rating, text);
    }
};


// Application Entry Point

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

window.App = App;