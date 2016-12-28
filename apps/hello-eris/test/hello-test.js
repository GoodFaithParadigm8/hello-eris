
var expect    = require("chai").expect;
var app = require("../app.js");
var chain = require("../js/libs/hello-chain");
var db = require("../js/libs/hello-db");

describe("Hello Eris Test", function() {

    this.timeout(5000); // 5 sec timeout to account for block commit delay

    it("Module Initialization", function(done) {
        this.timeout(5000);
        setTimeout(done, 3000);
        chain.init(function(error) {
            expect(error).to.be.null;
            db.refresh(function(error) {
                expect(error).to.be.null;
                done();
            });
        });
    });

    describe("Deals", function() {

        var deal1 = {id: 'i1', buyer: 'John', seller: 'Hank', amount: 7364};

        it("Add Deal", function(done) {
            chain.addDeal(deal1, function (error) {
                expect(error).to.be.null;
                chain.getDeals(function (error, deals) {
                    expect(error).to.be.null;
                    expect(deals.length).to.equal(1);
                    expect(deals[0].id).to.equal(deal1.id);
                    expect(deals[0].buyer).to.equal(deal1.buyer);
                    expect(deals[0].seller).to.equal(deal1.seller);
                    expect(deals[0].amount).to.equal(deal1.amount);
                    done();
                });
            });
        });

        after( function(done) {
            //TODO remove deals created in tests. Use a fresh chain for now to test!
            done();
        });

    });

});

