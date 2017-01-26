package de.unijena.bioinf.sirius.gui.msviewer.data;

import java.util.ArrayList;
import java.util.List;


public class DefaultPeakInformation implements PeakInformation{
	
	private double mass, relInt, absInt, signalNoise;
	
	private List<MolecularFormulaInformation> decomps;
	
	public DefaultPeakInformation(double mass, double relInt, double absInt, double signalNoise){
		this.mass = mass;
		this.relInt = relInt;
		this.absInt = absInt;
		this.signalNoise = signalNoise;
		
		this.decomps = new ArrayList<MolecularFormulaInformation>(5);
	}
	
	public DefaultPeakInformation(){
		this(-1,-1,-1,-1);
	}
	
	public void addMolecularFormulaInformation(MolecularFormulaInformation info){
		this.decomps.add(info);
	}
	
	public void removeMolecularFormulaInformation(MolecularFormulaInformation info){
		this.decomps.remove(info);
	}
	
	public void setMass(double mass){
		this.mass = mass;
	}
	
	public void setRelativeIntensity(double relInt){
		this.relInt = relInt;
	}
	
	public void setAbsoluteIntensity(double absInt){
		this.absInt = absInt;
	}
	
	public void setSignalNoise(double signalNoise){
		this.signalNoise = signalNoise;
	}

	@Override
	public double getMass() {
		return this.mass;
	}

	@Override
	public double getRelativeIntensity() {
		return this.relInt;
	}

	@Override
	public double getAbsoluteIntensity() {
		return this.absInt;
	}

	@Override
	public double getSignalToNoise() {
		return this.signalNoise;
	}

	@Override
	public List<MolecularFormulaInformation> getDecompositions() {
		return this.decomps;
	}

	@Override
	public boolean isIsotope() {
		return false;
	}

}
