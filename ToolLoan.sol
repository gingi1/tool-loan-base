// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/// @notice Records confirmations for a physical loan. Holds no assets.
contract ToolLoan {
    enum State { Missing, Offered, Active, ReturnReported, Returned, Cancelled }

    struct Loan {
        address lender;
        address borrower;
        bytes32 toolId;
        uint64 dueAt;
        State state;
    }

    uint256 public loanCount;
    mapping(uint256 => Loan) public loans;

    error InvalidLoan();
    error InvalidState();
    error Unauthorized();
    error OfferExpired();

    event LoanOffered(
        uint256 indexed loanId, address indexed lender, address indexed borrower,
        bytes32 toolId, uint64 dueAt
    );
    event LoanStateChanged(uint256 indexed loanId, State state, address indexed actor);

    function offer(address borrower, bytes32 toolId, uint64 dueAt) external returns (uint256 loanId) {
        if (borrower == address(0) || borrower == msg.sender ||
            toolId == bytes32(0) || dueAt <= block.timestamp) revert InvalidLoan();

        loanId = ++loanCount;
        loans[loanId] = Loan(msg.sender, borrower, toolId, dueAt, State.Offered);
        emit LoanOffered(loanId, msg.sender, borrower, toolId, dueAt);
    }

    function accept(uint256 loanId) external {
        Loan storage loan = loans[loanId];
        if (loan.state != State.Offered) revert InvalidState();
        if (msg.sender != loan.borrower) revert Unauthorized();
        if (block.timestamp >= loan.dueAt) revert OfferExpired();
        _advance(loanId, loan, State.Active);
    }

    function reportReturn(uint256 loanId) external {
        Loan storage loan = loans[loanId];
        if (loan.state != State.Active) revert InvalidState();
        if (msg.sender != loan.borrower) revert Unauthorized();
        _advance(loanId, loan, State.ReturnReported);
    }

    function confirmReturn(uint256 loanId) external {
        Loan storage loan = loans[loanId];
        if (loan.state != State.ReturnReported) revert InvalidState();
        if (msg.sender != loan.lender) revert Unauthorized();
        _advance(loanId, loan, State.Returned);
    }

    function cancelOffer(uint256 loanId) external {
        Loan storage loan = loans[loanId];
        if (loan.state != State.Offered) revert InvalidState();
        if (msg.sender != loan.lender) revert Unauthorized();
        _advance(loanId, loan, State.Cancelled);
    }

    function _advance(uint256 loanId, Loan storage loan, State next) private {
        loan.state = next;
        emit LoanStateChanged(loanId, next, msg.sender);
    }
}

